import { createClient } from 'jsr:@supabase/supabase-js@2'
import { studentMatchesPlayer } from '../_shared/identity.ts'
import { versionResponse } from '../_shared/version.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

interface ActionBody {
  action: 'create' | 'enter_scoring' | 'update_dead_stones' | 'finish' | 'update_clock' | 'reset'
  game_id?: string
  params?: any
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
    return versionResponse('manage_game_action', corsHeaders)
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  let body: ActionBody
  try {
    body = await req.json() as ActionBody
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const { action, game_id, params } = body
  if (!action) {
    return json({ error: 'Missing action field' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
  const authHeader = req.headers.get('Authorization') ?? ''

  let isServiceRole = false
  let validatedStudentId: string | null = null
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
          validatedStudentId = meta.student_id
        }
      } else {
        return json({ error: 'Invalid or expired token', detail: userErr?.message }, 401)
      }
    }
  }

  // 認証情報の厳密な検証（並行稼働期間終了）
  const hasAuth = isServiceRole || isTeacher || validatedStudentId !== null
  if (!hasAuth) {
    return json({ error: 'Forbidden: Invalid or missing authenticated session' }, 403)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey)

  // 1. 権限検証用のゲーム取得 (create 時以外)
  if (action !== 'create' && game_id) {
    const { data: game, error: gameErr } = await supabase
      .from('go_school_live_games')
      .select('black_player, white_player')
      .eq('id', game_id)
      .single()

    if (gameErr || !game) {
      return json({ error: 'Game not found' }, 404)
    }

    // 生徒の場合は対局者本人のみ許可。
    // black_player/white_player は `sid:<uuid>`、JWT の student_id は bare UUID。
    // studentMatchesPlayer が prefix の有無を吸収して照合する。
    if (!isServiceRole && !isTeacher) {
      const isPlayer =
        studentMatchesPlayer(validatedStudentId, game.black_player) ||
        studentMatchesPlayer(validatedStudentId, game.white_player)
      if (!isPlayer) {
        return json({ error: 'Forbidden: You are not a player of this game' }, 403)
      }
    }
  }

  try {
    // 2. アクションの実行
    if (action === 'create') {
      const { classroom_id, black_player, white_player, board_size, handicap, komi, clock } = params || {}
      if (!classroom_id || !black_player || !white_player || !board_size) {
        return json({ error: 'Missing params for create' }, 400)
      }
      
      const { data, error } = await supabase
        .from('go_school_live_games')
        .insert({
          classroom_id,
          black_player,
          white_player,
          board_size,
          handicap: handicap ?? 0,
          komi: komi ?? 6.5,
          clock: clock ?? null,
          status: 'playing',
        })
        .select()
        .single()

      if (error) throw error
      return json({ ok: true, game: data })
    }

    if (action === 'enter_scoring') {
      const { error } = await supabase
        .from('go_school_live_games')
        .update({
          status: 'scoring',
          scoring_dead_stones: [],
          updated_at: new Date().toISOString(),
        })
        .eq('id', game_id)

      if (error) throw error
      return json({ ok: true })
    }

    if (action === 'update_dead_stones') {
      const { dead_stones } = params || {}
      const { error } = await supabase
        .from('go_school_live_games')
        .update({
          scoring_dead_stones: dead_stones ?? [],
          updated_at: new Date().toISOString(),
        })
        .eq('id', game_id)

      if (error) throw error
      return json({ ok: true })
    }

    if (action === 'finish') {
      const { result } = params || {}
      const { error } = await supabase
        .from('go_school_live_games')
        .update({
          status: 'finished',
          result: result ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', game_id)

      if (error) throw error
      return json({ ok: true })
    }

    if (action === 'update_clock') {
      const { clock } = params || {}
      const { error } = await supabase
        .from('go_school_live_games')
        .update({
          clock: clock ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', game_id)

      if (error) throw error
      return json({ ok: true })
    }

    if (action === 'reset') {
      // リセットは先生または service_role のみ許可
      if (!isTeacher && !isServiceRole) {
        return json({ error: 'Forbidden: Only teachers can reset the game' }, 403)
      }

      // 着手の全削除
      const { error: deleteMovesError } = await supabase
        .from('go_school_live_moves')
        .delete()
        .eq('game_id', game_id)
        
      if (deleteMovesError) throw deleteMovesError
      
      // ゲーム情報の初期化
      const { error: resetGameError } = await supabase
        .from('go_school_live_games')
        .update({
          status: 'playing',
          result: null,
          scoring_dead_stones: [],
          clock: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', game_id)

      if (resetGameError) throw resetGameError
      return json({ ok: true })
    }

    return json({ error: 'Unsupported action' }, 400)
  } catch (err: any) {
    return json({ error: 'Database execution failed', detail: err.message }, 500)
  }
})
