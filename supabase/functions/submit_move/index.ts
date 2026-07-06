// online-go-school 対局着手の権威的バリデーション
// identity / 手番 / move_number 連番のみ検証。合法手判定はクライアント責務。
import { createClient } from 'jsr:@supabase/supabase-js@2'
import { studentMatchesPlayer, toStudentIdentity } from '../_shared/identity.ts'
import { versionResponse } from '../_shared/version.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

type Color = 'BLACK' | 'WHITE'

interface SubmitMoveBody {
  game_id: string
  caller_identity: string
  x: number
  y: number
  color: Color
  clock?: any
}

function opposite(c: Color): Color {
  return c === 'BLACK' ? 'WHITE' : 'BLACK'
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method === 'GET') {
    return versionResponse('submit_move', corsHeaders)
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  let body: SubmitMoveBody
  try {
    body = await req.json() as SubmitMoveBody
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const { game_id, caller_identity, x, y, color, clock } = body
  if (!game_id || !caller_identity || typeof x !== 'number' || typeof y !== 'number' || !color) {
    return json({ error: 'Missing required fields' }, 400)
  }
  if (color !== 'BLACK' && color !== 'WHITE') {
    return json({ error: 'Invalid color' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const authHeader = req.headers.get('Authorization') ?? ''

  let isServiceRole = false
  let validatedCallerId: string | null = null
  let isTeacher = false

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim()
    if (token === serviceRoleKey) {
      isServiceRole = true
    } else if (token) {
      // JWTの検証（anonClient経由）
      const anonClient = createClient(supabaseUrl, anonKey)
      const { data: userResult, error: userErr } = await anonClient.auth.getUser(token)
      if (!userErr && userResult?.user) {
        const user = userResult.user
        const meta = user.user_metadata ?? {}
        const role = meta.app_role
        
        if (role === 'teacher') {
          isTeacher = true
        } else if (role === 'student') {
          validatedCallerId = meta.student_id
        }
      } else {
        return json({ error: 'Invalid or expired token', detail: userErr?.message }, 401)
      }
    }
  }

  // なりすまし防止: 生徒の場合は認証済み student_id を強制使用。それ以外は body 申告値を信用。
  // player_id は black_player/white_player と同じ `sid:<uuid>` 形式で保存する（toStudentIdentity）。
  const callerIdToUse = (!isServiceRole && !isTeacher && validatedCallerId)
    ? toStudentIdentity(validatedCallerId)
    : caller_identity

  // 認証情報の厳密な検証（並行稼働期間終了）
  const hasAuth = isServiceRole || isTeacher || validatedCallerId !== null
  if (!hasAuth) {
    return json({ error: 'Forbidden: Invalid or missing authenticated session' }, 403)
  }

  const supabase = createClient(
    supabaseUrl,
    serviceRoleKey,
  )

  // 1. 対局取得
  const { data: game, error: gameErr } = await supabase
    .from('go_school_live_games')
    .select('id, status, black_player, white_player, handicap')
    .eq('id', game_id)
    .single()

  if (gameErr || !game) {
    return json({ error: 'Game not found' }, 404)
  }
  if (game.status !== 'playing') {
    return json({ error: `Game status is ${game.status}, not playing` }, 409)
  }

  // 2. identity と color の整合性チェック（sid: prefix の有無を吸収して照合）
  const expectedIdentity = color === 'BLACK' ? game.black_player : game.white_player
  if (!isTeacher && !isServiceRole && !studentMatchesPlayer(callerIdToUse, expectedIdentity)) {
    return json({
      error: 'Identity does not match the requested color',
      caller: callerIdToUse,
      expected: expectedIdentity,
    }, 403)
  }

  // 3. 最新 move を取得して次の move_number と期待色を算出
  const { data: lastMoves, error: movesErr } = await supabase
    .from('go_school_live_moves')
    .select('move_number, color')
    .eq('game_id', game_id)
    .order('move_number', { ascending: false })
    .limit(1)

  if (movesErr) {
    return json({ error: 'Failed to fetch moves', detail: movesErr.message }, 500)
  }

  const lastMove = lastMoves?.[0]
  const nextMoveNumber = (lastMove?.move_number ?? 0) + 1
  const expectedColor: Color = lastMove
    ? opposite(lastMove.color as Color)
    : (game.handicap >= 2 ? 'WHITE' : 'BLACK')

  if (color !== expectedColor) {
    return json({
      error: 'Not your turn',
      expected: expectedColor,
      submitted: color,
    }, 409)
  }

  // 4. insert (PK conflict で並列競合を自動検出)
  const { error: insertErr } = await supabase
    .from('go_school_live_moves')
    .insert({
      game_id,
      move_number: nextMoveNumber,
      x,
      y,
      color,
      player_id: callerIdToUse,
    })

  if (insertErr) {
    // 23505 = unique_violation (PK conflict → 他人が先に手を入れた)
    if (insertErr.code === '23505') {
      return json({ error: 'Move number already taken, retry', code: 'conflict' }, 409)
    }
    return json({ error: 'Insert failed', detail: insertErr.message }, 500)
  }

  // 5. updated_at と clock を打刻（Realtime に games 側の変化も知らせる）
  const updateData: any = { updated_at: new Date().toISOString() }
  if (clock !== undefined) {
    updateData.clock = clock
  }
  await supabase
    .from('go_school_live_games')
    .update(updateData)
    .eq('id', game_id)
 
  return json({ ok: true, move_number: nextMoveNumber })
})
