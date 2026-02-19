import { describe, it, expect } from 'vitest';
import { createNode, findNode, getPath, addMove, getMainPath, recalculateBoards, convertSgfToGameTree } from './treeUtilsV2';
import { createEmptyBoard } from './gameLogic';
import type { SgfTreeNode } from './sgfUtils';

function makeRoot(size = 9) {
  return createNode(null, createEmptyBoard(size), 1, 'BLACK', size);
}

describe('createNode', () => {
  it('ルートノードを作成', () => {
    const root = makeRoot();
    expect(root.parent).toBeNull();
    expect(root.children).toEqual([]);
    expect(root.nextNumber).toBe(1);
    expect(root.activeColor).toBe('BLACK');
    expect(root.boardSize).toBe(9);
    expect(root.id).toBeTruthy();
  });
});

describe('findNode', () => {
  it('ルート自身を検索', () => {
    const root = makeRoot();
    expect(findNode(root, root.id)).toBe(root);
  });

  it('子ノードを検索', () => {
    const root = makeRoot();
    const board = createEmptyBoard(9);
    board[4][4] = { color: 'BLACK', number: 1 };
    const child = addMove(root, board, 2, 'WHITE', 9, { x: 5, y: 5, color: 'BLACK' });
    expect(findNode(root, child.id)).toBe(child);
  });

  it('存在しないIDはnull', () => {
    const root = makeRoot();
    expect(findNode(root, 'nonexistent')).toBeNull();
  });
});

describe('getPath', () => {
  it('ルートへのパスは[ルート]', () => {
    const root = makeRoot();
    const path = getPath(root, root.id);
    expect(path).toEqual([root]);
  });

  it('子ノードへのパス', () => {
    const root = makeRoot();
    const board = createEmptyBoard(9);
    board[4][4] = { color: 'BLACK', number: 1 };
    const child = addMove(root, board, 2, 'WHITE', 9, { x: 5, y: 5, color: 'BLACK' });
    const path = getPath(root, child.id);
    expect(path.length).toBe(2);
    expect(path[0]).toBe(root);
    expect(path[1]).toBe(child);
  });

  it('存在しないIDは[ルート]に戻る', () => {
    const root = makeRoot();
    const path = getPath(root, 'xxx');
    expect(path).toEqual([root]);
  });
});

describe('addMove', () => {
  it('子ノードを追加', () => {
    const root = makeRoot();
    const board = createEmptyBoard(9);
    board[4][4] = { color: 'BLACK', number: 1 };
    const child = addMove(root, board, 2, 'WHITE', 9, { x: 5, y: 5, color: 'BLACK' });
    expect(root.children.length).toBe(1);
    expect(child.parent).toBe(root);
    expect(child.move).toEqual({ x: 5, y: 5, color: 'BLACK' });
  });

  it('同じ手を追加すると既存ノードを返す（重複防止）', () => {
    const root = makeRoot();
    const board = createEmptyBoard(9);
    board[4][4] = { color: 'BLACK', number: 1 };
    const move = { x: 5, y: 5, color: 'BLACK' as const };
    const child1 = addMove(root, board, 2, 'WHITE', 9, move);
    const child2 = addMove(root, board, 2, 'WHITE', 9, move);
    expect(child1).toBe(child2);
    expect(root.children.length).toBe(1);
  });

  it('異なる手で分岐を作成', () => {
    const root = makeRoot();
    const board1 = createEmptyBoard(9);
    board1[4][4] = { color: 'BLACK', number: 1 };
    const board2 = createEmptyBoard(9);
    board2[2][2] = { color: 'BLACK', number: 1 };
    addMove(root, board1, 2, 'WHITE', 9, { x: 5, y: 5, color: 'BLACK' });
    addMove(root, board2, 2, 'WHITE', 9, { x: 3, y: 3, color: 'BLACK' });
    expect(root.children.length).toBe(2);
  });
});

describe('getMainPath', () => {
  it('ルートのみのパス', () => {
    const root = makeRoot();
    expect(getMainPath(root)).toEqual([root]);
  });

  it('常に最初の子を辿る', () => {
    const root = makeRoot();
    const board1 = createEmptyBoard(9);
    board1[4][4] = { color: 'BLACK', number: 1 };
    const board2 = createEmptyBoard(9);
    board2[2][2] = { color: 'WHITE', number: 2 };
    const child = addMove(root, board1, 2, 'WHITE', 9, { x: 5, y: 5, color: 'BLACK' });
    // 分岐を追加（2番目の変化）
    addMove(root, createEmptyBoard(9), 2, 'WHITE', 9, { x: 3, y: 3, color: 'BLACK' });
    addMove(child, board2, 3, 'BLACK', 9, { x: 3, y: 3, color: 'WHITE' });

    const path = getMainPath(root);
    expect(path.length).toBe(3);
    expect(path[1].move?.x).toBe(5); // 最初の子を辿る
  });
});

describe('recalculateBoards', () => {
  it('子ノードの盤面を再計算', () => {
    const root = makeRoot();
    const board = createEmptyBoard(9);
    board[4][4] = { color: 'BLACK', number: 1 };
    const child = addMove(root, board, 2, 'WHITE', 9, { x: 5, y: 5, color: 'BLACK' });
    // ルートの盤面を空に戻して再計算
    recalculateBoards(root);
    // 子ノードの盤面にBLACK(5,5)が反映されている
    expect(child.board[4][4]?.color).toBe('BLACK');
    expect(child.board[4][4]?.number).toBe(1);
  });
});

describe('convertSgfToGameTree', () => {
  it('単純なSGFツリーノードを変換', () => {
    const sgfNode: SgfTreeNode = {
      move: { x: 5, y: 5, color: 'BLACK' },
      children: [],
    };
    const board = createEmptyBoard(9);
    const node = convertSgfToGameTree(sgfNode, null, 9, 1, board);
    expect(node.board[4][4]?.color).toBe('BLACK');
    expect(node.board[4][4]?.number).toBe(1);
    expect(node.nextNumber).toBe(2);
  });

  it('分岐付きツリーを変換', () => {
    const sgfRoot: SgfTreeNode = {
      move: { x: 5, y: 5, color: 'BLACK' },
      children: [
        { move: { x: 4, y: 4, color: 'WHITE' }, children: [] },
        { move: { x: 6, y: 6, color: 'WHITE' }, children: [] },
      ],
    };
    const board = createEmptyBoard(9);
    const node = convertSgfToGameTree(sgfRoot, null, 9, 1, board);
    expect(node.children.length).toBe(2);
    expect(node.children[0].move?.x).toBe(4);
    expect(node.children[1].move?.x).toBe(6);
  });

  it('セットアップ（AB/AW）付きノード', () => {
    const sgfNode: SgfTreeNode = {
      setup: { ab: ['cc', 'ee'], aw: ['gg'], ae: [] },
      children: [],
    };
    const board = createEmptyBoard(9);
    const node = convertSgfToGameTree(sgfNode, null, 9, 1, board);
    expect(node.board[2][2]?.color).toBe('BLACK');  // cc = (3,3)
    expect(node.board[4][4]?.color).toBe('BLACK');  // ee = (5,5)
    expect(node.board[6][6]?.color).toBe('WHITE');  // gg = (7,7)
  });
});
