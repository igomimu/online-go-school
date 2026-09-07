import { describe, it, expect } from 'vitest';
import { getReviewTimeline, nodeAtReviewIndex } from './reviewTimeline';
import { createNode, addMove } from './treeUtilsV2';
import { createEmptyBoard } from './gameLogic';

/** 3手の一本道を作る（root → 1手目 → 2手目 → 3手目） */
function makeLine() {
  const root = createNode(null, createEmptyBoard(9), 1, 'BLACK', 9);
  let node = root;
  for (let i = 1; i <= 3; i++) {
    const board = createEmptyBoard(9);
    board[i][i] = { color: i % 2 === 1 ? 'BLACK' : 'WHITE', number: i };
    node = addMove(node, board, i + 1, i % 2 === 1 ? 'BLACK' : 'WHITE', 9, {
      x: i + 1, y: i + 1, color: i % 2 === 1 ? 'BLACK' : 'WHITE',
    });
  }
  return { root, last: node };
}

describe('reviewTimeline', () => {
  it('今いる手より前も先も1本に並べ、今の位置を返す', () => {
    const { root } = makeLine();
    const second = root.children[0].children[0];

    const timeline = getReviewTimeline(second);

    expect(timeline.nodes).toHaveLength(4); // root + 3手
    expect(timeline.index).toBe(2);
  });

  it('最終手にいても、来た道がそのまま残る', () => {
    const { last } = makeLine();

    const timeline = getReviewTimeline(last);

    expect(timeline.nodes).toHaveLength(4);
    expect(timeline.index).toBe(3);
  });

  it('◯手目へ で目的のノードを引ける', () => {
    const { last, root } = makeLine();

    expect(nodeAtReviewIndex(last, 0)).toBe(root);
    expect(nodeAtReviewIndex(last, 3)).toBe(last);
    expect(nodeAtReviewIndex(last, 1)).toBe(root.children[0]);
  });

  it('範囲の外を指されても端で止める（生徒から届く値は信用しない）', () => {
    const { last, root } = makeLine();

    expect(nodeAtReviewIndex(last, -5)).toBe(root);
    expect(nodeAtReviewIndex(last, 999)).toBe(last);
    expect(nodeAtReviewIndex(last, 1.7)).toBe(root.children[0]);
  });
});
