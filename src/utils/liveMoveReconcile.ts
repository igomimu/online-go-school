import type { LiveMoveRow } from './liveGameApi';

/** 自端末が送信中の仮着手（楽観的更新） */
export const OPTIMISTIC_PREFIX = 'temp-opt-';
/** 相手の端末から RTC で先に届いた、まだサーバーで確定していない着手 */
export const REMOTE_PREFIX = 'temp-lk-';

/**
 * RTC で受け取った未確定の手を、サーバーに現れないまま何秒残すか。
 *
 * 相手の保存が通れば数百ミリ秒で INSERT が届く。これを過ぎても現れない手は、
 * 相手の保存が失敗した「幻の石」なので消す。以前は temp- で始まる手を無条件に
 * 残していたため、相手の盤にだけ石が残り続けて盤面と手数が食い違っていた
 * （2026-09-07 Codex レビュー #2）。
 */
export const REMOTE_PENDING_TTL_MS = 6000;

/**
 * サーバー棋譜を正本として置き換えつつ、まだ確定を待っている仮着手だけを残す。
 * 同じ手番号がサーバーにあれば、仮着手を確定行へ差し替える。
 *
 * 自端末の送信中の手は成否が確定した時点で呼び出し側が消す/差し替えるのでそのまま残す。
 * 相手から届いた手は、こちらでは成否を知りようがないので寿命で切る。
 */
export function reconcileLiveMoves(
  current: LiveMoveRow[],
  serverMoves: LiveMoveRow[],
  now: number = Date.now(),
): LiveMoveRow[] {
  const serverMoveNumbers = new Set(serverMoves.map(move => move.move_number));
  const pending = current.filter(move => {
    if (!move.player_id.startsWith('temp-')) return false;
    if (serverMoveNumbers.has(move.move_number)) return false;
    if (move.player_id.startsWith(OPTIMISTIC_PREFIX)) return true;
    const age = now - new Date(move.created_at).getTime();
    return Number.isFinite(age) ? age < REMOTE_PENDING_TTL_MS : true;
  });
  return [...serverMoves, ...pending].sort((a, b) => a.move_number - b.move_number);
}
