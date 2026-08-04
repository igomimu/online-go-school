import { describe, it, expect } from 'vitest';
import { createNode } from './treeUtilsV2';
import { createEmptyBoard } from './gameLogic';
import { playReviewMove } from './reviewMove';

function makeRoot(size = 9) {
  return createNode(null, createEmptyBoard(size), 1, 'BLACK', size);
}

describe('playReviewMove', () => {
  it('空点に打つと黒から始まる子ノードができる', () => {
    const root = makeRoot();
    const next = playReviewMove(root, 5, 5);
    expect(next).not.toBeNull();
    expect(next!.parent).toBe(root);
    expect(next!.move).toEqual({ x: 5, y: 5, color: 'BLACK' });
    expect(next!.board[4][4]).toEqual({ color: 'BLACK', number: 1 });
    expect(root.board[4][4]).toBeNull(); // 元のノードの盤は書き換えない
  });

  it('黒の次は白になる', () => {
    const root = makeRoot();
    const black = playReviewMove(root, 5, 5)!;
    const white = playReviewMove(black, 5, 6)!;
    expect(white.move?.color).toBe('WHITE');
  });

  it('石のある場所には打てない', () => {
    const root = makeRoot();
    const black = playReviewMove(root, 5, 5)!;
    expect(playReviewMove(black, 5, 5)).toBeNull();
  });

  it('盤の外は打てない', () => {
    const root = makeRoot();
    expect(playReviewMove(root, 0, 5)).toBeNull();
    expect(playReviewMove(root, 10, 5)).toBeNull();
    expect(playReviewMove(root, 5, 10)).toBeNull();
  });

  it('取れる石は盤から消える', () => {
    // 黒が (1,1) の白一子を (1,2)(2,1) で囲って取る
    let node = makeRoot();
    node = playReviewMove(node, 5, 5)!;   // 黒（手数合わせ）
    node = playReviewMove(node, 1, 1)!;   // 白
    node = playReviewMove(node, 1, 2)!;   // 黒
    node = playReviewMove(node, 9, 9)!;   // 白
    node = playReviewMove(node, 2, 1)!;   // 黒: これで白(1,1)が取られる
    expect(node.board[0][0]).toBeNull();
  });

  it('路数を明示すればノードの値より優先される', () => {
    const root = makeRoot(9);
    expect(playReviewMove(root, 9, 9, 5)).toBeNull(); // 5路として扱えば盤外
  });
});
