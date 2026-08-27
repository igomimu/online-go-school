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

export type ScoringColor = 'BLACK' | 'WHITE';

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
  /** 整地の「確定」を押した対局者の色。黒白が揃った時点で終局する */
  scoring_confirmed: ScoringColor[] | null;
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
  action: 'create' | 'enter_scoring' | 'update_dead_stones' | 'confirm_scoring' | 'finish' | 'delete_saved_game' | 'update_clock' | 'reset' | 'resume' | 'interrupt' | 'interrupt_all' | 'request_undo' | 'respond_undo' | 'list_active_for_players',
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

/**
 * 時間切れで終わった対局を対局一覧に残しておく時間。
 * 回線トラブルで切れた対局を講師が再開できるようにするため、終局後もしばらく一覧に出す。
 */
export const TIMEOUT_GAME_VISIBLE_MS = 3 * 60 * 60 * 1000;

export async function fetchLiveGames(classroomId: string): Promise<LiveGameRow[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('go_school_live_games')
    .select('*')
    .eq('classroom_id', classroomId)
    // 中断局はここに出さない。棋譜履歴の一件として扱い、再開も削除も履歴から行う。
    // 進行中の場所に置くと、生徒リストの碁盤に居座って新しい対局が埋もれる（2026-08-27）
    .in('status', ['playing', 'scoring'])
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const active = (data ?? []) as LiveGameRow[];

  // 時間切れ終局は「講師が再開できる対象」なので直近ぶんだけ別途拾う。
  // ここが失敗しても進行中の対局一覧は返す（再開導線が出ないだけに留める）。
  try {
    const since = new Date(Date.now() - TIMEOUT_GAME_VISIBLE_MS).toISOString();
    const { data: timedOut, error: timedOutErr } = await supabase
      .from('go_school_live_games')
      .select('*')
      .eq('classroom_id', classroomId)
      .eq('status', 'finished')
      .in('result', ['B+T', 'W+T'])
      .gte('updated_at', since)
      .order('created_at', { ascending: false });
    if (timedOutErr) throw new Error(timedOutErr.message);
    return [...active, ...((timedOut ?? []) as LiveGameRow[])];
  } catch (e) {
    console.error('[fetchLiveGames] 時間切れ対局の取得に失敗:', e);
    return active;
  }
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

export interface ConfirmScoringResult {
  confirmed: ScoringColor[];
  finished: boolean;
}

/**
 * 整地を確定する。対局者は黒白が揃った時点で終局し、
 * 講師は対局者が操作できないときの代行として単独で終局させられる。
 */
export async function confirmScoring(gameId: string, result: string): Promise<ConfirmScoringResult> {
  const res = await executeGameAction('confirm_scoring', gameId, { result });
  return {
    confirmed: Array.isArray(res.confirmed) ? res.confirmed as ScoringColor[] : [],
    finished: res.finished === true,
  };
}

export async function finishGame(gameId: string, result: string): Promise<void> {
  await executeGameAction('finish', gameId, { result });
}

/** 保存棋譜を削除する。対応する中断局があれば同時に解除する（講師専用）。 */
export async function deleteSavedGame(gameId: string): Promise<void> {
  await executeGameAction('delete_saved_game', gameId);
}

export interface BulkDeleteResult {
  deleted: string[];
  failed: { id: string; error: string }[];
}

/**
 * 保存棋譜をまとめて削除する（講師専用）。
 * 1件ずつ delete_saved_game を呼ぶので、中断局の解除など1件削除と同じ扱いになる。
 * 途中で1件失敗しても残りは続け、消せた分と消せなかった分を返す。
 * まとめて消したのに「どこまで消えたか分からない」状態を残さないため。
 */
export async function deleteSavedGames(
  gameIds: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<BulkDeleteResult> {
  const total = gameIds.length;
  const deleted: string[] = [];
  const failed: { id: string; error: string }[] = [];
  // 1件ずつ順に投げると数十件で待たされるので、少しだけ並べて投げる。
  const CONCURRENCY = 4;
  let cursor = 0;

  const worker = async () => {
    while (cursor < total) {
      const gameId = gameIds[cursor++];
      try {
        await deleteSavedGame(gameId);
        deleted.push(gameId);
      } catch (err) {
        failed.push({ id: gameId, error: err instanceof Error ? err.message : String(err) });
      }
      onProgress?.(deleted.length + failed.length, total);
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker()));
  return { deleted, failed };
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
