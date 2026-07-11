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
    // 黒(4,4)→白(5,5)→黒パス がサーバー確定 → 白の番。白は4手目を打とうとしていた
    const serverMoves = [move(1, 'BLACK', 4, 4), move(2, 'WHITE', 5, 5), move(3, 'BLACK', 0, 0)];
    expect(decideSubmitRetry(serverMoves, 'WHITE', 0, 0, 0, 4)).toEqual({ kind: 'retry' });
  });

  it('相手の手がまだサーバー未確定なら wait', () => {
    // サーバーは白(5,5)まで。白は4手目を打つつもり（黒の3手目がまだ届いていない）→ 待つ
    const serverMoves = [move(1, 'BLACK', 4, 4), move(2, 'WHITE', 5, 5)];
    expect(decideSubmitRetry(serverMoves, 'WHITE', 0, 0, 0, 4)).toEqual({ kind: 'wait' });
  });

  it('自分のこの手が既にサーバーにあれば already-applied（送信二重化の自己回復）', () => {
    // 黒パスの二重送信で2通目が409 conflict → 意図した3手目=自分の黒パスが既に存在
    const serverMoves = [move(1, 'BLACK', 4, 4), move(2, 'WHITE', 5, 5), move(3, 'BLACK', 0, 0)];
    expect(decideSubmitRetry(serverMoves, 'BLACK', 0, 0, 0, 3)).toEqual({
      kind: 'already-applied',
      moveNumber: 3,
    });
  });

  it('通常の着手でも already-applied を検出（同色同座標）', () => {
    const serverMoves = [move(1, 'BLACK', 4, 4)];
    expect(decideSubmitRetry(serverMoves, 'BLACK', 4, 4, 0, 1)).toEqual({
      kind: 'already-applied',
      moveNumber: 1,
    });
  });

  it('サーバーに手がない場合は互先なら黒が retry・白は wait', () => {
    expect(decideSubmitRetry([], 'BLACK', 3, 3, 0, 1)).toEqual({ kind: 'retry' });
    expect(decideSubmitRetry([], 'WHITE', 3, 3, 0, 2)).toEqual({ kind: 'wait' });
  });

  it('置き碁（handicap>=2）で手がない場合は白が retry', () => {
    expect(decideSubmitRetry([], 'WHITE', 3, 3, 2, 1)).toEqual({ kind: 'retry' });
    expect(decideSubmitRetry([], 'BLACK', 3, 3, 2, 2)).toEqual({ kind: 'wait' });
  });

  // 2026-07-11 コウE2Eフレークの真因: 盤が先へ進んだ後の古い手の再送（ゴースト挿入）を禁止する
  describe('superseded（盤が先へ進んだら古い手を破棄）', () => {
    it('意図した手番号に別の手が入っていたら superseded', () => {
      // 白は3手目に(6,6)を打つつもりだったが、3手目には黒パスが入っていた
      const serverMoves = [move(1, 'BLACK', 4, 4), move(2, 'WHITE', 5, 5), move(3, 'BLACK', 0, 0)];
      expect(decideSubmitRetry(serverMoves, 'WHITE', 6, 6, 0, 3)).toEqual({ kind: 'superseded' });
    });

    it('意図した手番号を盤が越えていたら、手番が自分でも superseded（ゴースト再送禁止）', () => {
      // 黒は3手目を打つつもりだったが、盤は4手目まで進んでいて次は5手目（黒番）。
      // 旧実装は「黒番だからretry」して3手目の古い手を5手目として挿入していた。
      const serverMoves = [
        move(1, 'BLACK', 4, 4),
        move(2, 'WHITE', 5, 5),
        move(3, 'BLACK', 3, 3),
        move(4, 'WHITE', 6, 6),
      ];
      expect(decideSubmitRetry(serverMoves, 'BLACK', 7, 7, 0, 3)).toEqual({ kind: 'superseded' });
    });

    it('意図した手番号が次の番号だが手番の色が合わない場合も superseded', () => {
      // 前提が崩れている（自分の手番計算とサーバーが不一致）→ 再送せず破棄
      const serverMoves = [move(1, 'BLACK', 4, 4)];
      expect(decideSubmitRetry(serverMoves, 'BLACK', 5, 5, 0, 2)).toEqual({ kind: 'superseded' });
    });
  });
});
