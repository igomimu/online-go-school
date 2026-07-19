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

// Realtime購読の前に必ず待つ認証関門。
// postgres_changes のRLS認可は「購読時のトークン」で評価されるため、
// ページ読み込み直後（セッション復元前＝匿名状態）に購読すると、
// その後セッションが復元されてもイベントが一切届かない。
// （2026-07-11 別ウィンドウ碁盤に相手の着手が反映されないバグの真因）
let realtimeAuthReady: Promise<void> | null = null;
export function ensureRealtimeAuth(): Promise<void> {
  if (!realtimeAuthReady) {
    const sb = getSupabase();
    realtimeAuthReady = sb.auth
      .getSession() // セッション復元（storage読み込み）を待つ
      .then(({ data }) => {
        const token = data.session?.access_token;
        if (token) sb.realtime.setAuth(token);
      })
      .catch(() => {
        // 認証なし（匿名）でも購読自体は行う（RLSが許す範囲で受信）
      });
  }
  return realtimeAuthReady;
}

export interface UndoRequest {
  requested_by: string;
  requested_color: StoneColor;
  target_move_number: number;
  requested_at: string;
}

export interface LiveGameRow {
  id: string;
  classroom_id: string;
  black_player: string;
  white_player: string;
  board_size: number;
  handicap: number;
  komi: number;
  status: 'playing' | 'scoring' | 'finished' | 'interrupted';
  result: string | null;
  scoring_dead_stones: string[];
  clock: GameClock | null;
  undo_request: UndoRequest | null;
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
  clock?: GameClock | null;
}

/**
 * Edge Function のベースURL。
 * 既定は本番 Supabase の `/functions/v1`。
 * ローカルE2E等で `VITE_DOJO_FUNCTIONS_URL` を与えると localhost の `supabase functions serve` に向く。
 */
export function functionsBaseUrl(): string {
  return (
    import.meta.env.VITE_DOJO_FUNCTIONS_URL ||
    `${import.meta.env.VITE_DOJO_SUPABASE_URL}/functions/v1`
  );
}

/**
 * 認証済みセッション(JWT)から app_role=teacher/student を持つ access_token を取り出す。
 * 取得できなければ null。service_role 直接書き込みのフォールバックは廃止済み（虚偽の緑の温床だったため）。
 */
async function getRoleAuthToken(sb: SupabaseClient): Promise<string | null> {
  try {
    const { data } = await sb.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    const now = Math.floor(Date.now() / 1000);
    const exp = payload?.exp;
    const isValidExp = typeof exp === 'number' && exp > now;
    if (isValidExp && (payload?.app_role === 'teacher' || payload?.app_role === 'student')) {
      return token;
    }
  } catch {
    // セッション取得失敗時は null（Edge Function 側で 403）
  }
  return null;
}

async function executeGameAction(
  action: 'create' | 'enter_scoring' | 'update_dead_stones' | 'finish' | 'update_clock' | 'reset' | 'resume' | 'interrupt' | 'interrupt_all' | 'request_undo' | 'respond_undo' | 'list_active_for_players',
  gameId?: string,
  params?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  console.log("[executeGameAction] action:", action, "params:", params);
  const sb = getSupabase();
  const url = `${functionsBaseUrl()}/manage_game_action`;

  const authHeader = await getRoleAuthToken(sb);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (authHeader) {
    headers['Authorization'] = `Bearer ${authHeader}`;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action, game_id: gameId, params }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

export async function createLiveGame(opts: CreateLiveGameOpts): Promise<LiveGameRow> {
  const res = await executeGameAction('create', undefined, {
    classroom_id: opts.classroomId,
    black_player: opts.blackPlayer,
    white_player: opts.whitePlayer,
    board_size: opts.boardSize,
    handicap: opts.handicap,
    komi: opts.komi,
    clock: opts.clock ?? null,
  });
  if (!res || !res.game) {
    throw new Error('createLiveGame failed: no game returned from manage_game_action');
  }
  return res.game as LiveGameRow;
}

export async function fetchLiveGames(classroomId: string): Promise<LiveGameRow[]> {
  const { data, error } = await getSupabase()
    .from('go_school_live_games')
    .select('*')
    .eq('classroom_id', classroomId)
    .in('status', ['playing', 'scoring', 'interrupted'])
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as LiveGameRow[];
}

export async function fetchActiveLiveGamesForPlayers(identities: string[]): Promise<LiveGameRow[]> {
  if (identities.length === 0) return [];

  const res = await executeGameAction('list_active_for_players', undefined, { identities });
  return (res.games ?? []) as LiveGameRow[];
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

export async function fetchLiveMovesForGames(gameIds: string[]): Promise<LiveMoveRow[]> {
  if (gameIds.length === 0) return [];
  const { data, error } = await getSupabase()
    .from('go_school_live_moves')
    .select('*')
    .in('game_id', gameIds)
    .order('game_id', { ascending: true })
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
  clock?: GameClock,
): Promise<SubmitMoveResult> {
  const sb = getSupabase();
  const url = `${functionsBaseUrl()}/submit_move`;

  const authHeader = await getRoleAuthToken(sb);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authHeader) headers['Authorization'] = `Bearer ${authHeader}`;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ game_id: gameId, caller_identity: callerIdentity, x, y, color, clock }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("[liveGameApi SUBMIT ERROR BODY]", JSON.stringify(body));
    return { ok: false, error: body.error || `HTTP ${res.status}` };
  }
  return { ok: true, move_number: body.move_number };
}

/** 整地モード突入（先生権限、trust-based） */
export async function enterScoring(gameId: string): Promise<void> {
  await executeGameAction('enter_scoring', gameId);
}

export async function updateDeadStones(gameId: string, deadStones: string[]): Promise<void> {
  await executeGameAction('update_dead_stones', gameId, { dead_stones: deadStones });
}

export async function finishGame(gameId: string, result: string): Promise<void> {
  await executeGameAction('finish', gameId, { result });
}

export async function interruptGame(gameId: string): Promise<void> {
  await executeGameAction('interrupt', gameId);
}

export async function interruptAllGames(classroomId: string): Promise<void> {
  await executeGameAction('interrupt_all', undefined, { classroom_id: classroomId });
}

export async function updateClock(gameId: string, clock: GameClock): Promise<void> {
  await executeGameAction('update_clock', gameId, { clock });
}

/** 「待った」を申請する（対局者本人のみ、直前の1手が対象） */
export async function requestUndo(gameId: string): Promise<void> {
  await executeGameAction('request_undo', gameId);
}

/** 「待った」への応答（承諾/拒否/取り下げ） */
export async function respondUndo(gameId: string, accept: boolean): Promise<void> {
  await executeGameAction('respond_undo', gameId, { accept });
}

/** 対局ごとのRealtimeチャンネル購読（games更新 + moves挿入/削除） */
export function subscribeLiveGame(
  gameId: string,
  handlers: {
    onGameChange?: (row: LiveGameRow) => void;
    onMoveInsert?: (row: LiveMoveRow) => void;
    // 「待った」承諾時に go_school_live_moves から該当手がDELETEされる。
    // これを購読しないと相手側クライアントの盤面が1手前へ戻らない。
    onMoveDelete?: (row: { game_id: string; move_number: number }) => void;
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
    .on(
      'postgres_changes',
      { event: 'DELETE', schema: 'public', table: 'go_school_live_moves', filter: `game_id=eq.${gameId}` },
      (payload) => handlers.onMoveDelete?.(payload.old as { game_id: string; move_number: number }),
    )
    .subscribe();
  return channel;
}

export function subscribeLiveMovesForGames(
  gameIds: string[],
  onMoveInsert: (row: LiveMoveRow) => void,
): RealtimeChannel {
  const sb = getSupabase();
  const ids = new Set(gameIds);
  const channelKey = gameIds.slice().sort().join(',');
  const channel = sb
    .channel(`live-moves:${channelKey || 'empty'}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'go_school_live_moves' },
      (payload) => {
        const row = payload.new as LiveMoveRow;
        if (ids.has(row.game_id)) onMoveInsert(row);
      },
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
  await executeGameAction('reset', gameId);
}

/** 中断または終了した対局を再開する（先生または対局者） */
export async function resumeLiveGame(gameId: string): Promise<void> {
  await executeGameAction('resume', gameId);
}
