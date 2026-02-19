import { describe, it, expect } from 'vitest';
import { createEmptyBoard, boardHash, isLegalMove, checkCapture } from './gameLogic';
import type { BoardState } from '../components/GoBoard';

// ヘルパー: 指定座標に石を配置（1-indexed）
function placeStone(board: BoardState, x: number, y: number, color: 'BLACK' | 'WHITE') {
  board[y - 1][x - 1] = { color };
}

describe('createEmptyBoard', () => {
  it('9路盤を作成', () => {
    const board = createEmptyBoard(9);
    expect(board.length).toBe(9);
    expect(board[0].length).toBe(9);
    expect(board[4][4]).toBeNull();
  });

  it('19路盤を作成', () => {
    const board = createEmptyBoard(19);
    expect(board.length).toBe(19);
    expect(board[18].length).toBe(19);
  });

  it('全ての交点がnull', () => {
    const board = createEmptyBoard(9);
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 9; x++) {
        expect(board[y][x]).toBeNull();
      }
    }
  });
});

describe('boardHash', () => {
  it('空盤のハッシュ', () => {
    const board = createEmptyBoard(3);
    expect(boardHash(board)).toBe('.../.../...');
  });

  it('石があるハッシュ', () => {
    const board = createEmptyBoard(3);
    placeStone(board, 1, 1, 'BLACK');
    placeStone(board, 3, 3, 'WHITE');
    expect(boardHash(board)).toBe('B../.../..W');
  });

  it('同じ盤面なら同じハッシュ', () => {
    const b1 = createEmptyBoard(5);
    const b2 = createEmptyBoard(5);
    placeStone(b1, 3, 3, 'BLACK');
    placeStone(b2, 3, 3, 'BLACK');
    expect(boardHash(b1)).toBe(boardHash(b2));
  });
});

describe('checkCapture', () => {
  it('隅の石を取る（2子で囲む）', () => {
    // 左上隅(1,1)に白、(2,1)と(1,2)に黒を打つ
    const board = createEmptyBoard(9);
    placeStone(board, 1, 1, 'WHITE');
    placeStone(board, 2, 1, 'BLACK');
    // (1,2)に黒を打って取る
    placeStone(board, 1, 2, 'BLACK');
    const { board: result, capturedCount } = checkCapture(board, 1, 2, 'BLACK', 9);
    expect(capturedCount).toBe(1);
    expect(result[0][0]).toBeNull(); // 白石が取られた
  });

  it('辺の石を取る（3子で囲む）', () => {
    const board = createEmptyBoard(9);
    // 上辺(3,1)に白
    placeStone(board, 3, 1, 'WHITE');
    placeStone(board, 2, 1, 'BLACK');
    placeStone(board, 4, 1, 'BLACK');
    // (3,2)に黒を打って取る
    placeStone(board, 3, 2, 'BLACK');
    const { board: result, capturedCount } = checkCapture(board, 3, 2, 'BLACK', 9);
    expect(capturedCount).toBe(1);
    expect(result[0][2]).toBeNull();
  });

  it('連結した2子を取る', () => {
    const board = createEmptyBoard(9);
    // 白2子：(1,1)(2,1)
    placeStone(board, 1, 1, 'WHITE');
    placeStone(board, 2, 1, 'WHITE');
    // 黒で囲む
    placeStone(board, 3, 1, 'BLACK');
    placeStone(board, 1, 2, 'BLACK');
    placeStone(board, 2, 2, 'BLACK');
    const { capturedCount } = checkCapture(board, 2, 2, 'BLACK', 9);
    expect(capturedCount).toBe(2);
  });

  it('取り石がないとき capturedCount=0', () => {
    const board = createEmptyBoard(9);
    placeStone(board, 5, 5, 'BLACK');
    const { capturedCount } = checkCapture(board, 5, 5, 'BLACK', 9);
    expect(capturedCount).toBe(0);
  });
});

describe('isLegalMove', () => {
  it('空点に着手可能', () => {
    const board = createEmptyBoard(9);
    expect(isLegalMove(board, 5, 5, 'BLACK', 9)).toBe(true);
  });

  it('既に石がある場所は着手不可', () => {
    const board = createEmptyBoard(9);
    placeStone(board, 5, 5, 'BLACK');
    expect(isLegalMove(board, 5, 5, 'WHITE', 9)).toBe(false);
  });

  it('自殺手は禁止', () => {
    // 隅で自殺手
    //  B .
    //  . B  ←ここに白は打てない（呼吸点なし、取り石なし）
    // ↑実際は(1,1)は隅なので(2,1)Bと(1,2)Bで囲われている状態で(1,1)白は自殺
    const board = createEmptyBoard(9);
    placeStone(board, 2, 1, 'BLACK');
    placeStone(board, 1, 2, 'BLACK');
    expect(isLegalMove(board, 1, 1, 'WHITE', 9)).toBe(false);
  });

  it('取り石があれば自殺手にならない', () => {
    // 隅(1,1)黒を白が囲んでいて、(1,1)の黒を取れる場合
    const board = createEmptyBoard(9);
    placeStone(board, 1, 1, 'BLACK');
    placeStone(board, 2, 1, 'WHITE');
    // (1,2)に白を打つと黒1子を取れるので合法
    expect(isLegalMove(board, 1, 2, 'WHITE', 9)).toBe(true);
  });

  it('コウの禁止', () => {
    // 典型的なコウの形
    //   1 2 3 4
    // 1 . B W .
    // 2 B . B W
    // 3 . B W .
    const board = createEmptyBoard(9);
    placeStone(board, 2, 1, 'BLACK');
    placeStone(board, 3, 1, 'WHITE');
    placeStone(board, 1, 2, 'BLACK');
    placeStone(board, 4, 2, 'WHITE');
    placeStone(board, 3, 2, 'BLACK');
    placeStone(board, 2, 3, 'BLACK');
    placeStone(board, 3, 3, 'WHITE');

    // lastBoardHash = 白が打つ前の盤面ハッシュ
    const hashBeforeWhiteMove = boardHash(board);

    // 白が(2,2)に打って黒(3,2)を取る
    placeStone(board, 2, 2, 'WHITE');
    const { board: afterCap } = checkCapture(board, 2, 2, 'WHITE', 9);

    // 黒が(3,2)に打ち返すと白(2,2)が取れて元の形に戻る → コウで禁止
    expect(isLegalMove(afterCap, 3, 2, 'BLACK', 9, hashBeforeWhiteMove)).toBe(false);
  });
});
