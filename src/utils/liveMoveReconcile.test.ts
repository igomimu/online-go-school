import { describe, expect, it } from 'vitest';
import type { LiveMoveRow } from './liveGameApi';
import { reconcileLiveMoves } from './liveMoveReconcile';

const move = (moveNumber: number, color: 'BLACK' | 'WHITE', playerId: string): LiveMoveRow => ({
  game_id: 'game-1',
  move_number: moveNumber,
  x: moveNumber,
  y: moveNumber,
  color,
  player_id: playerId,
  created_at: '2026-08-23T00:00:00.000Z',
});

describe('reconcileLiveMoves', () => {
  it('取り逃した相手の着手をサーバー棋譜から補う', () => {
    const current = [move(1, 'BLACK', 'sid:black')];
    const server = [move(1, 'BLACK', 'sid:black'), move(2, 'WHITE', 'teacher')];
    expect(reconcileLiveMoves(current, server).map(m => [m.move_number, m.color])).toEqual([
      [1, 'BLACK'],
      [2, 'WHITE'],
    ]);
  });

  it('同じ手番号の仮着手をサーバー確定行へ差し替える', () => {
    const current = [move(1, 'BLACK', 'temp-opt-black')];
    const server = [move(1, 'BLACK', 'sid:black')];
    expect(reconcileLiveMoves(current, server)).toEqual(server);
  });

  it('送信完了前の仮着手は定期照合で消さない', () => {
    const pending = move(2, 'WHITE', 'temp-opt-white');
    expect(reconcileLiveMoves([move(1, 'BLACK', 'sid:black'), pending], [move(1, 'BLACK', 'sid:black')]))
      .toEqual([move(1, 'BLACK', 'sid:black'), pending]);
  });
});
