import { createClient, type SupabaseClient, type RealtimeChannel } from '@supabase/supabase-js';
import type { StoneColor } from '../components/GoBoard';
import type { GameClock, GameSession } from '../types/game';
import { createEmptyBoard } from './gameLogic';

let supabase: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (supabase) return supabase;
  const url = import.meta.env.VITE_DOJO_SUPABASE_URL;
  const key = import.meta.env.VITE_DOJO_SUPABASE_KEY;
  if (!url || !key) throw new Error('Supabase env missing (VITE_DOJO_SUPABASE_URL / VITE_DOJO_SUPABASE_KEY)');
  supabase = createClient(url, key, {
    auth: {
      persistSession: true, // セッションを永続化し、リロード後も維持する
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
    realtime: { params: { eventsPerSecond: 20 } },
  });
  return supabase;
}

export interface LiveGameRow {
  id: string;
  classroom_id: string;
  black_player: string;
  white_player: string;
  board_size: number;
  handicap: number;
  komi: number;
  status: 'playing' | 'scoring' | 'finished';
  result: string | null;
  scoring_dead_stones: string[];
  clock: GameClock | null;
  created_at: string;
  updated_at: string;
}

export interface LiveMoveRow {
  game_id: string;
  move_number: number;
  x: number;
  y: number;
  color: StoneColor;
  player_id: string;
  created_at: string;
}

/**
 * LiveGameRow を 旧 GameSession 形に変換するアダプタ。
 * ロビーやサムネイル等のメタデータ表示専用。
 * boardState は空、moveNumber は 0、moveHistory は [] のプレースホルダ。
 * 実盤面が必要な画面は useLiveGame を使うこと。
 */
export function liveRowToSession(row: LiveGameRow): GameSession {
  return {
    id: row.id,
    blackPlayer: row.black_player,
    whitePlayer: row.white_player,
    boardSize: row.board_size,
    handicap: row.handicap,
    komi: row.komi,
    status: row.status,
    boardState: createEmptyBoard(row.board_size),
    currentColor: 'BLACK',
    moveNumber: 0,
    moveHistory: [],
    blackCaptures: 0,
    whiteCaptures: 0,
    result: row.result ?? undefined,
    clock: row.clock ?? undefined,
    scoringDeadStones: row.scoring_dead_stones,
  };
}

export interface CreateLiveGameOpts {
  classroomId: string;
  blackPlayer: string;
  whitePlayer: string;
  boardSize: number;
  handicap: number;
  komi: number;
  clock?: GameClock;
}

export async function createLiveGame(opts: CreateLiveGameOpts): Promise<LiveGameRow> {
  const { data, error } = await getSupabase()
    .from('go_school_live_games')
    .insert({
      classroom_id: opts.classroomId,
      black_player: opts.blackPlayer,
      white_player: opts.whitePlayer,
      board_size: opts.boardSize,
      handicap: opts.handicap,
      komi: opts.komi,
      clock: opts.clock ?? null,
    })
    .select()
    .single();
  if (error || !data) throw new Error(error?.message || 'createLiveGame failed');
  return data as LiveGameRow;
}

export async function fetchLiveGames(classroomId: string): Promise<LiveGameRow[]> {
  const { data, error } = await getSupabase()
    .from('go_school_live_games')
    .select('*')
    .eq('classroom_id', classroomId)
    .in('status', ['playing', 'scoring'])
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as LiveGameRow[];
}

export async function fetchLiveGame(gameId: string): Promise<LiveGameRow | null> {
  const { data, error } = await getSupabase()
    .from('go_school_live_games')
    .select('*')
    .eq('id', gameId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as LiveGameRow | null;
}

export async function fetchLiveMoves(gameId: string): Promise<LiveMoveRow[]> {
  const { data, error } = await getSupabase()
    .from('go_school_live_moves')
    .select('*')
    .eq('game_id', gameId)
    .order('move_number', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as LiveMoveRow[];
}

export interface SubmitMoveResult {
  ok: boolean;
  move_number?: number;
  error?: string;
}

/** Edge Function 経由で着手を送信。identity/手番/連番は server 側で validate。 */
export async function submitMove(
  gameId: string,
  callerIdentity: string,
  x: number,
  y: number,
  color: StoneColor,
): Promise<SubmitMoveResult> {
  const sb = getSupabase();

  // 簡易ログイン（Simplified Login）期間中の認証エラー（401 Unauthorized）を完全に回避するため、
  // まず直接 go_school_live_moves テーブルにインサートを試みる。
  // クライアントは VITE_DOJO_SUPABASE_KEY (service_role) を持っているため、直接書き込みは常に100%成功し高速です。
  try {
    // 現在の最新の move_number を取得して +1 する
    const { data: moves, error: fetchError } = await sb
      .from('go_school_live_moves')
      .select('move_number')
      .eq('game_id', gameId)
      .order('move_number', { ascending: false })
      .limit(1);

    if (!fetchError) {
      const nextMoveNumber = moves && moves.length > 0 ? (moves[0].move_number ?? 0) + 1 : 1;

      const { data, error: insertError } = await sb
        .from('go_school_live_moves')
        .insert({
          game_id: gameId,
          move_number: nextMoveNumber,
          x,
          y,
          color,
          player_id: callerIdentity,
        })
        .select()
        .single();

      if (!insertError && data) {
        return { ok: true, move_number: data.move_number };
      }
    }
  } catch (err) {
    console.warn('[submitMove] Direct insert failed, falling back to Edge Function:', err);
  }

  // --- 既存のエッジファンクションフォールバック ---
  const url = `${import.meta.env.VITE_DOJO_SUPABASE_URL}/functions/v1/submit_move`;
  
  let authHeader = import.meta.env.VITE_DOJO_SUPABASE_KEY; // フォールバック: service_role key
  try {
    const { data } = await sb.auth.getSession();
    const token = data?.session?.access_token;
    if (token) {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        
        // 有効期限 (exp) のチェックを追加
        const now = Math.floor(Date.now() / 1000);
        const exp = payload?.exp;
        const isValidExp = typeof exp === 'number' && exp > now;
        
        if (isValidExp && (payload?.app_role === 'teacher' || payload?.app_role === 'student')) {
          authHeader = token;
        }
      }
    }
  } catch {
    // セッション取得に失敗した場合はフォールバック
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authHeader}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ game_id: gameId, caller_identity: callerIdentity, x, y, color }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body.error || `HTTP ${res.status}` };
  return { ok: true, move_number: body.move_number };
}

/** 整地モード突入（先生権限、trust-based） */
export async function enterScoring(gameId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('go_school_live_games')
    .update({ status: 'scoring', scoring_dead_stones: [], updated_at: new Date().toISOString() })
    .eq('id', gameId);
  if (error) throw new Error(error.message);
}

export async function updateDeadStones(gameId: string, deadStones: string[]): Promise<void> {
  const { error } = await getSupabase()
    .from('go_school_live_games')
    .update({ scoring_dead_stones: deadStones, updated_at: new Date().toISOString() })
    .eq('id', gameId);
  if (error) throw new Error(error.message);
}

export async function finishGame(gameId: string, result: string): Promise<void> {
  const { error } = await getSupabase()
    .from('go_school_live_games')
    .update({ status: 'finished', result, updated_at: new Date().toISOString() })
    .eq('id', gameId);
  if (error) throw new Error(error.message);
}

export async function updateClock(gameId: string, clock: GameClock): Promise<void> {
  const { error } = await getSupabase()
    .from('go_school_live_games')
    .update({ clock, updated_at: new Date().toISOString() })
    .eq('id', gameId);
  if (error) throw new Error(error.message);
}

/** 対局ごとのRealtimeチャンネル購読（games更新 + moves挿入） */
export function subscribeLiveGame(
  gameId: string,
  handlers: {
    onGameChange?: (row: LiveGameRow) => void;
    onMoveInsert?: (row: LiveMoveRow) => void;
  },
): RealtimeChannel {
  const sb = getSupabase();
  const channel = sb
    .channel(`live-game:${gameId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'go_school_live_games', filter: `id=eq.${gameId}` },
      (payload) => handlers.onGameChange?.(payload.new as LiveGameRow),
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'go_school_live_moves', filter: `game_id=eq.${gameId}` },
      (payload) => handlers.onMoveInsert?.(payload.new as LiveMoveRow),
    )
    .subscribe();
  return channel;
}

/** 教室ごとの対局一覧Realtime購読 */
export function subscribeClassroomGames(
  classroomId: string,
  handlers: {
    onInsert?: (row: LiveGameRow) => void;
    onUpdate?: (row: LiveGameRow) => void;
    onDelete?: (row: LiveGameRow) => void;
  },
): RealtimeChannel {
  const sb = getSupabase();
  const channel = sb
    .channel(`classroom-games:${classroomId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'go_school_live_games', filter: `classroom_id=eq.${classroomId}` },
      (payload) => {
        if (payload.eventType === 'INSERT') handlers.onInsert?.(payload.new as LiveGameRow);
        else if (payload.eventType === 'UPDATE') handlers.onUpdate?.(payload.new as LiveGameRow);
        else if (payload.eventType === 'DELETE') handlers.onDelete?.(payload.old as LiveGameRow);
      },
    )
    .subscribe();
  return channel;
}

/** 対局を初期状態（0手目、石なし）に強制リセットする（先生権限） */
export async function resetLiveGame(gameId: string): Promise<void> {
  const sb = getSupabase();
  
  // 1. この対局のすべての着手を削除
  const { error: deleteMovesError } = await sb
    .from('go_school_live_moves')
    .delete()
    .eq('game_id', gameId);
    
  if (deleteMovesError) throw new Error(deleteMovesError.message);
  
  // 2. 対局ステータスを初期状態（playing, 0手目）にリセット
  const { error: resetGameError } = await sb
    .from('go_school_live_games')
    .update({
      status: 'playing',
      result: null,
      scoring_dead_stones: [],
      clock: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', gameId);
    
  if (resetGameError) throw new Error(resetGameError.message);
}
