import { createClient } from 'jsr:@supabase/supabase-js@2'
import { playersMatchPair, studentMatchesPlayer } from '../_shared/identity.ts'
import { exportLiveGameToSgf, formatTokyoSgfDate } from '../_shared/sgf.ts'
import { versionResponse } from '../_shared/version.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

interface ActionBody {
  action: 'create' | 'enter_scoring' | 'update_dead_stones' | 'finish' | 'update_clock' | 'reset' | 'resume' | 'interrupt' | 'interrupt_all' | 'list_active_for_players'
  game_id?: string
  params?: any
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function pauseClock(clock: any) {
  return clock ? { ...clock, lastTickTime: null } : null
}

async function saveGameHistory(supabase: any, game: any, result: string | null) {
  const { data: movesForHistory, error: historyMovesErr } = await supabase
    .from('go_school_live_moves')
    .select('x, y, color')
    .eq('game_id', game.id)
    .order('move_number', { ascending: true })

  if (historyMovesErr) throw historyMovesErr

  const date = formatTokyoSgfDate()
  const sgf = exportLiveGameToSgf(
    game,
    movesForHistory ?? [],
    result ?? '',
    date,
  )
  const { error: saveHistoryErr } = await supabase
    .from('go_school_games')
    .upsert({
      id: game.id,
      date,
      black_player: game.black_player,
      white_player: game.white_player,
      board_size: game.board_size,
      handicap: game.handicap,
      komi: game.komi,
      result,
      sgf,
    })

  if (saveHistoryErr) throw saveHistoryErr
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
    if (action === 'list_active_for_players') {
      if (!isTeacher && !isServiceRole) {
        return json({ error: 'Forbidden: Only teachers can list active games' }, 403)
      }

      const identities = Array.isArray(params?.identities)
        ? params.identities.filter((identity: unknown): identity is string => typeof identity === 'string' && identity.trim().length > 0)
        : []
      if (identities.length === 0) {
        return json({ ok: true, games: [] })
      }

      const { data, error } = await supabase
        .from('go_school_live_games')
        .select('*')
        .in('status', ['playing', 'scoring', 'interrupted'])
        .order('updated_at', { ascending: false })

      if (error) throw error

      const games = (data ?? []).filter((game: any) =>
        identities.some((identity: string) =>
          studentMatchesPlayer(identity, game.black_player) ||
          studentMatchesPlayer(identity, game.white_player),
        ),
      )

      return json({ ok: true, games })
    }

    if (action === 'create') {
      const { classroom_id, black_player, white_player, board_size, handicap, komi, clock } = params || {}
      if (!classroom_id || !black_player || !white_player || !board_size) {
        return json({ error: 'Missing params for create' }, 400)
      }

      const { data: activeGames, error: activeGamesError } = await supabase
        .from('go_school_live_games')
        .select('id, black_player, white_player')
        .eq('classroom_id', classroom_id)
        .in('status', ['playing', 'scoring', 'interrupted'])

      if (activeGamesError) throw activeGamesError
      const duplicate = (activeGames ?? []).find((game: any) =>
        playersMatchPair(game.black_player, game.white_player, black_player, white_player),
      )
      if (duplicate) {
        return json({ error: 'Active game already exists for these players', game: duplicate }, 409)
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
      const normalizedResult = result ?? null

      const { data: gameForHistory, error: historyGameErr } = await supabase
        .from('go_school_live_games')
        .select('id, black_player, white_player, board_size, handicap, komi')
        .eq('id', game_id)
        .single()

      if (historyGameErr) throw historyGameErr

      const { error } = await supabase
        .from('go_school_live_games')
        .update({
          status: 'finished',
          result: normalizedResult,
          updated_at: new Date().toISOString(),
        })
        .eq('id', game_id)

      if (error) throw error

      await saveGameHistory(supabase, gameForHistory, normalizedResult)

      return json({ ok: true })
    }

    if (action === 'interrupt') {
      const { data: gameToInterrupt, error: interruptGameErr } = await supabase
        .from('go_school_live_games')
        .select('id, black_player, white_player, board_size, handicap, komi, status, clock')
        .eq('id', game_id)
        .single()

      if (interruptGameErr) throw interruptGameErr

      if (!['playing', 'scoring'].includes(gameToInterrupt.status)) {
        return json({ ok: true, skipped: true })
      }

      await saveGameHistory(supabase, gameToInterrupt, '中断')

      const { error } = await supabase
        .from('go_school_live_games')
        .update({
          status: 'interrupted',
          result: '中断',
          clock: pauseClock(gameToInterrupt.clock),
          updated_at: new Date().toISOString(),
        })
        .eq('id', game_id)
        .in('status', ['playing', 'scoring'])

      if (error) throw error
      return json({ ok: true })
    }

    if (action === 'interrupt_all') {
      // 教室単位の一括中断は先生または service_role のみ許可
      if (!isTeacher && !isServiceRole) {
        return json({ error: 'Forbidden: Only teachers can interrupt classroom games' }, 403)
      }

      const { classroom_id } = params || {}
      if (!classroom_id) {
        return json({ error: 'Missing params.classroom_id for interrupt_all' }, 400)
      }

      const { data: gamesToInterrupt, error: listErr } = await supabase
        .from('go_school_live_games')
        .select('id, black_player, white_player, board_size, handicap, komi, status, clock')
        .eq('classroom_id', classroom_id)
        .in('status', ['playing', 'scoring'])

      if (listErr) throw listErr

      let count = 0
      for (const gameToInterrupt of gamesToInterrupt ?? []) {
        await saveGameHistory(supabase, gameToInterrupt, '中断')

        const { error } = await supabase
          .from('go_school_live_games')
          .update({
            status: 'interrupted',
            result: '中断',
            clock: pauseClock(gameToInterrupt.clock),
            updated_at: new Date().toISOString(),
          })
          .eq('id', gameToInterrupt.id)
          .in('status', ['playing', 'scoring'])

        if (error) throw error
        count += 1
      }

      return json({ ok: true, count })
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

    if (action === 'resume') {
      const { data: gameToResume, error: resumeGameErr } = await supabase
        .from('go_school_live_games')
        .select('clock')
        .eq('id', game_id)
        .single()

      if (resumeGameErr) throw resumeGameErr

      const { error } = await supabase
        .from('go_school_live_games')
        .update({
          status: 'playing',
          result: null,
          clock: pauseClock(gameToResume.clock),
          updated_at: new Date().toISOString(),
        })
        .eq('id', game_id)

      if (error) throw error
      return json({ ok: true })
    }

    return json({ error: 'Unsupported action' }, 400)
  } catch (err: any) {
    return json({ error: 'Database execution failed', detail: err.message }, 500)
  }
})
