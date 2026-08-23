import type { LiveMoveRow } from './liveGameApi';

/**
 * サーバー棋譜を正本として置き換えつつ、まだ送信中の仮着手だけは残す。
 * 同じ手番号がサーバーにあれば、仮着手を確定行へ差し替える。
 */
export function reconcileLiveMoves(
  current: LiveMoveRow[],
  serverMoves: LiveMoveRow[],
): LiveMoveRow[] {
  const serverMoveNumbers = new Set(serverMoves.map(move => move.move_number));
  const pending = current.filter(move =>
    move.player_id.startsWith('temp-') && !serverMoveNumbers.has(move.move_number),
  );
  return [...serverMoves, ...pending].sort((a, b) => a.move_number - b.move_number);
}
