import { describe, expect, it } from 'vitest';
import { createEmptyBoard } from './gameLogic';
import { draftDeadStones, handicapInitialStones, ownershipFromBlack } from './deadStoneDraft';
import type { LiveGameRow } from './liveGameApi';

/** 3路。左上に黒石、右下に白石を置いた盤 */
function board3() {
  const board = createEmptyBoard(3);
  board[0][0] = { color: 'BLACK' };
  board[2][2] = { color: 'WHITE' };
  return board;
}

describe('死石の下書き', () => {
  it('KataGoの手番側視点を黒視点へ揃える', () => {
    expect(ownershipFromBlack([0.9, -0.5], 'BLACK')).toEqual([0.9, -0.5]);
    expect(ownershipFromBlack([0.9, -0.5], 'WHITE')).toEqual([-0.9, 0.5]);
  });

  it('相手の地の中にある石を死石として拾う', () => {
    // 左上は白地(-1)、右下は黒地(+1) ＝ 置いてある石はどちらも死んでいる
    const ownership = [
      -1, -1, 0,
      0, 0, 0,
      0, 1, 1,
    ];
    expect(draftDeadStones(board3(), 3, ownership)).toEqual(['1,1', '3,3']);
  });

  it('自分の地の中にある石は拾わない', () => {
    const ownership = [
      1, 1, 0,
      0, 0, 0,
      0, -1, -1,
    ];
    expect(draftDeadStones(board3(), 3, ownership)).toEqual([]);
  });

  it('どちらの地とも言えない石には触らない（数え切れていない局面で暴れさせない）', () => {
    const ownership = [
      -0.3, 0, 0,
      0, 0, 0,
      0, 0, 0.4,
    ];
    expect(draftDeadStones(board3(), 3, ownership)).toEqual([]);
  });

  it('盤の大きさと合わない ownership は使わない', () => {
    expect(draftDeadStones(board3(), 3, [1, 2, 3])).toEqual([]);
  });

  it('置石は着手ではなく初期配置としてKataGoへ渡す', () => {
    const game = { board_size: 19, handicap: 2 } as LiveGameRow;
    // 2子は右上（Q16）と左下（D4）の星
    expect(handicapInitialStones(game)).toEqual([['B', 'Q16'], ['B', 'D4']]);
    expect(handicapInitialStones({ board_size: 19, handicap: 0 } as LiveGameRow)).toEqual([]);
  });
});
