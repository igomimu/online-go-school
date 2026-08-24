import { describe, it, expect } from 'vitest';
import { createNode, findNode, getPath, addMove, getMainPath, recalculateBoards, convertSgfToGameTree, removeNode, isRemovableNode, withBranchNumbers } from './treeUtilsV2';
import type { BoardState } from '../components/GoBoard';
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

describe('removeNode', () => {
  it('子ノードを親のchildrenから除去し、親を返す（直近の一手取り消し）', () => {
    const root = makeRoot();
    const board = createEmptyBoard(9);
    board[4][4] = { color: 'BLACK', number: 1 };
    const child = addMove(root, board, 2, 'WHITE', 9, { x: 5, y: 5, color: 'BLACK' });
    expect(root.children.length).toBe(1);

    const result = removeNode(child);
    expect(result).toBe(root);
    expect(root.children.length).toBe(0);
  });

  it('分岐が複数ある場合、除去対象のノードだけを消す', () => {
    const root = makeRoot();
    const board1 = createEmptyBoard(9);
    board1[4][4] = { color: 'BLACK', number: 1 };
    const board2 = createEmptyBoard(9);
    board2[2][2] = { color: 'BLACK', number: 1 };
    const child1 = addMove(root, board1, 2, 'WHITE', 9, { x: 5, y: 5, color: 'BLACK' });
    addMove(root, board2, 2, 'WHITE', 9, { x: 3, y: 3, color: 'BLACK' });
    expect(root.children.length).toBe(2);

    removeNode(child1);
    expect(root.children.length).toBe(1);
    expect(root.children[0].move).toEqual({ x: 3, y: 3, color: 'BLACK' });
  });

  it('ルートノード（親なし）はnullを返し、何も変更しない', () => {
    const root = makeRoot();
    const result = removeNode(root);
    expect(result).toBeNull();
  });

  // 2026-08-01: 検討中に取り消しを押しすぎると読み込んだ棋譜の手まで1手ずつ消え、
  // 元手順が失われる事故があった（実機再現済み）。棋譜の手は消さず戻るだけにする。
  it('読み込んだ棋譜の手(fromRecord)は削除せず、親を返して戻るだけにする', () => {
    const root = makeRoot();
    const board = createEmptyBoard(9);
    board[4][4] = { color: 'BLACK', number: 1 };
    const recordMove = addMove(root, board, 2, 'WHITE', 9, { x: 5, y: 5, color: 'BLACK' });
    recordMove.fromRecord = true;

    const result = removeNode(recordMove);
    expect(result).toBe(root);
    expect(root.children).toEqual([recordMove]); // 消えていない
  });

  it('棋譜の途中に足した検討の手は削除できる（元手順は残る）', () => {
    const root = makeRoot();
    const b1 = createEmptyBoard(9);
    b1[4][4] = { color: 'BLACK', number: 1 };
    const recordMove = addMove(root, b1, 2, 'WHITE', 9, { x: 5, y: 5, color: 'BLACK' });
    recordMove.fromRecord = true;
    const b2 = createEmptyBoard(9);
    b2[0][0] = { color: 'BLACK', number: 1 };
    const studyMove = addMove(root, b2, 2, 'WHITE', 9, { x: 1, y: 1, color: 'BLACK' });

    expect(removeNode(studyMove)).toBe(root);
    expect(root.children).toEqual([recordMove]);
  });

  it('isRemovableNode: 棋譜の手はfalse、検討の手はtrue、ルートはfalse', () => {
    const root = makeRoot();
    const board = createEmptyBoard(9);
    board[4][4] = { color: 'BLACK', number: 1 };
    const recordMove = addMove(root, board, 2, 'WHITE', 9, { x: 5, y: 5, color: 'BLACK' });
    recordMove.fromRecord = true;
    const studyMove = addMove(recordMove, board, 3, 'BLACK', 9, { x: 1, y: 1, color: 'WHITE' });

    expect(isRemovableNode(root)).toBe(false);
    expect(isRemovableNode(recordMove)).toBe(false);
    expect(isRemovableNode(studyMove)).toBe(true);
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

  it('読み込んだ棋譜のノードは全てfromRecordが立つ（取り消しから保護するため）', () => {
    const sgfRoot: SgfTreeNode = {
      move: { x: 5, y: 5, color: 'BLACK' },
      children: [{ move: { x: 4, y: 4, color: 'WHITE' }, children: [
        { move: { x: 6, y: 6, color: 'BLACK' }, children: [] },
      ] }],
    };
    const node = convertSgfToGameTree(sgfRoot, null, 9, 1, createEmptyBoard(9));
    expect(node.fromRecord).toBe(true);
    expect(node.children[0].fromRecord).toBe(true);
    expect(node.children[0].children[0].fromRecord).toBe(true);

    // 棋譜の上に足した検討の手だけがfromRecordなし＝取り消せる
    const study = addMove(node.children[0], createEmptyBoard(9), 3, 'BLACK', 9, { x: 1, y: 1, color: 'BLACK' });
    expect(study.fromRecord).toBeUndefined();
    expect(isRemovableNode(study)).toBe(true);
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

describe('withBranchNumbers', () => {
    const empty = (size: number) => Array.from({ length: size }, () => Array(size).fill(null)) as BoardState;

    it('棋譜の手には番号を振らず、検討で置いた手から1,2,3…と振る', () => {
        // 棋譜: 1手目(5,5)黒 → 2手目(3,3)白。そのあと検討で 3手目(7,7)黒、4手目(2,7)白
        const root = createNode(null, empty(9), 1, 'BLACK', 9);
        const b1 = empty(9);
        b1[4][4] = { color: 'BLACK', number: 1 };
        const n1 = addMove(root, b1, 2, 'BLACK', 9, { x: 5, y: 5, color: 'BLACK' });
        n1.fromRecord = true;
        const b2 = b1.map(r => [...r]);
        b2[2][2] = { color: 'WHITE', number: 2 };
        const n2 = addMove(n1, b2, 3, 'WHITE', 9, { x: 3, y: 3, color: 'WHITE' });
        n2.fromRecord = true;
        const b3 = b2.map(r => [...r]);
        b3[6][6] = { color: 'BLACK', number: 3 };
        const n3 = addMove(n2, b3, 4, 'BLACK', 9, { x: 7, y: 7, color: 'BLACK' });
        const b4 = b3.map(r => [...r]);
        b4[6][1] = { color: 'WHITE', number: 4 };
        const n4 = addMove(n3, b4, 5, 'WHITE', 9, { x: 2, y: 7, color: 'WHITE' });

        const board = withBranchNumbers(n4);
        expect(board[4][4]?.branchNumber).toBeUndefined(); // 棋譜の手
        expect(board[2][2]?.branchNumber).toBeUndefined(); // 棋譜の手
        expect(board[6][6]?.branchNumber).toBe(1);         // 検討の1手目
        expect(board[6][1]?.branchNumber).toBe(2);         // 検討の2手目
    });

    it('全部が棋譜の手なら番号を振らない', () => {
        const root = createNode(null, empty(9), 1, 'BLACK', 9);
        const b1 = empty(9);
        b1[4][4] = { color: 'BLACK', number: 1 };
        const n1 = addMove(root, b1, 2, 'BLACK', 9, { x: 5, y: 5, color: 'BLACK' });
        n1.fromRecord = true;
        expect(withBranchNumbers(n1)).toBe(n1.board);
    });

    it('元の盤面は書き換えない', () => {
        const root = createNode(null, empty(9), 1, 'BLACK', 9);
        const b1 = empty(9);
        b1[4][4] = { color: 'BLACK', number: 1 };
        const n1 = addMove(root, b1, 2, 'BLACK', 9, { x: 5, y: 5, color: 'BLACK' });
        withBranchNumbers(n1);
        expect(n1.board[4][4]?.branchNumber).toBeUndefined();
    });
});
