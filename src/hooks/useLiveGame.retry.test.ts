import { describe, it, expect } from 'vitest';
import { decideSubmitRetry, isRetryableSubmitError } from './useLiveGame';

// 早指しレース（相手の手がサーバー確定する前に自分の手を送って409）後の再送判定。
// 実E2E再現: 生徒Aのパスが未確定のうちに生徒Bがパス → 409 "Not your turn" →
// Bのパスが消え、2連続パスによる整地モード移行が発火しない（multi-student-game.spec.ts）。

type Move = { move_number: number; x: number; y: number; color: 'BLACK' | 'WHITE' };

const move = (move_number: number, color: 'BLACK' | 'WHITE', x: number, y: number): Move => ({
  move_number,
  x,
  y,
  color,
});

describe('isRetryableSubmitError', () => {
  it('手番不一致409は再送対象', () => {
    expect(isRetryableSubmitError('Not your turn')).toBe(true);
  });

  it('連番衝突409は再送対象', () => {
    expect(isRetryableSubmitError('Move number already taken, retry')).toBe(true);
  });

  it('認可エラーや不明エラーは再送しない', () => {
    expect(isRetryableSubmitError('Identity does not match the requested color')).toBe(false);
    expect(isRetryableSubmitError('Game status is finished, not playing')).toBe(false);
    expect(isRetryableSubmitError(undefined)).toBe(false);
    expect(isRetryableSubmitError('')).toBe(false);
  });
});

describe('decideSubmitRetry', () => {
  it('相手の手がサーバーに現れて手番が来ていれば retry（白パスのレース解消）', () => {
    // 黒(4,4)→白(5,5)→黒パス がサーバー確定 → 白の番
    const serverMoves = [move(1, 'BLACK', 4, 4), move(2, 'WHITE', 5, 5), move(3, 'BLACK', 0, 0)];
    expect(decideSubmitRetry(serverMoves, 'WHITE', 0, 0, 0)).toEqual({ kind: 'retry' });
  });

  it('相手の手がまだサーバー未確定なら wait', () => {
    // サーバーは白(5,5)まで → まだ黒の番。白のパスは待つ
    const serverMoves = [move(1, 'BLACK', 4, 4), move(2, 'WHITE', 5, 5)];
    expect(decideSubmitRetry(serverMoves, 'WHITE', 0, 0, 0)).toEqual({ kind: 'wait' });
  });

  it('自分のこの手が既にサーバーにあれば already-applied（送信二重化の自己回復）', () => {
    // 黒パスの二重送信で2通目が409 conflict → サーバー最終手=自分の黒パス
    const serverMoves = [move(1, 'BLACK', 4, 4), move(2, 'WHITE', 5, 5), move(3, 'BLACK', 0, 0)];
    expect(decideSubmitRetry(serverMoves, 'BLACK', 0, 0, 0)).toEqual({
      kind: 'already-applied',
      moveNumber: 3,
    });
  });

  it('通常の着手でも already-applied を検出（同色同座標）', () => {
    const serverMoves = [move(1, 'BLACK', 4, 4)];
    expect(decideSubmitRetry(serverMoves, 'BLACK', 4, 4, 0)).toEqual({
      kind: 'already-applied',
      moveNumber: 1,
    });
  });

  it('サーバーに手がない場合は互先なら黒が retry・白は wait', () => {
    expect(decideSubmitRetry([], 'BLACK', 3, 3, 0)).toEqual({ kind: 'retry' });
    expect(decideSubmitRetry([], 'WHITE', 3, 3, 0)).toEqual({ kind: 'wait' });
  });

  it('置き碁（handicap>=2）で手がない場合は白が retry', () => {
    expect(decideSubmitRetry([], 'WHITE', 3, 3, 2)).toEqual({ kind: 'retry' });
    expect(decideSubmitRetry([], 'BLACK', 3, 3, 2)).toEqual({ kind: 'wait' });
  });
});
