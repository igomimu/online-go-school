import { describe, it, expect } from 'vitest';
import { createEmptyBoard, boardHash, isLegalMove, checkCapture } from './gameLogic';
import type { BoardState } from '../components/GoBoard';
import { deriveBoardState, koReferenceHash } from '../hooks/useLiveGame';
import type { LiveGameRow, LiveMoveRow } from './liveGameApi';

// ヘルパー: 指定座標に石を配置（1-indexed）
function placeStone(board: BoardState, x: number, y: number, color: 'BLACK' | 'WHITE') {
  board[y - 1][x - 1] = { color };
}

function liveGame(overrides: Partial<LiveGameRow> = {}): LiveGameRow {
  return {
    id: 'game-1',
    classroom_id: 'classroom-1',
    black_player: 'sid:black',
    white_player: 'sid:white',
    board_size: 9,
    handicap: 0,
    komi: 6.5,
    status: 'playing',
    result: null,
    scoring_dead_stones: [],
    clock: null,
    created_at: '2026-07-11T00:00:00.000Z',
    updated_at: '2026-07-11T00:00:00.000Z',
    ...overrides,
  };
}

function move(moveNumber: number, x: number, y: number, color: 'BLACK' | 'WHITE'): LiveMoveRow {
  return {
    game_id: 'game-1',
    move_number: moveNumber,
    x,
    y,
    color,
    player_id: color === 'BLACK' ? 'sid:black' : 'sid:white',
    created_at: `2026-07-11T00:${String(moveNumber).padStart(2, '0')}:00.000Z`,
  };
}

function koMoves(): LiveMoveRow[] {
  return [
    move(1, 3, 3, 'BLACK'),
    move(2, 5, 2, 'WHITE'),
    move(3, 4, 2, 'BLACK'),
    move(4, 5, 4, 'WHITE'),
    move(5, 4, 4, 'BLACK'),
    move(6, 6, 3, 'WHITE'),
    move(7, 5, 3, 'BLACK'),
    move(8, 4, 3, 'WHITE'),
  ];
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

  it('自殺手（隅）は禁止', () => {
    // 隅で自殺手
    //  B .
    //  . B  ←ここに白は打てない（呼吸点なし、取り石なし）
    // ↑実際は(1,1)は隅なので(2,1)Bと(1,2)Bで囲われている状態で(1,1)白は自殺
    const board = createEmptyBoard(9);
    placeStone(board, 2, 1, 'BLACK');
    placeStone(board, 1, 2, 'BLACK');
    expect(isLegalMove(board, 1, 1, 'WHITE', 9)).toBe(false);
  });

  it('自殺手（グループ）は禁止', () => {
    const board = createEmptyBoard(9);
    placeStone(board, 2, 2, 'WHITE');
    placeStone(board, 2, 3, 'WHITE');
    placeStone(board, 1, 1, 'BLACK');
    placeStone(board, 3, 1, 'BLACK');
    placeStone(board, 1, 2, 'BLACK');
    placeStone(board, 3, 2, 'BLACK');
    placeStone(board, 1, 3, 'BLACK');
    placeStone(board, 3, 3, 'BLACK');
    placeStone(board, 2, 4, 'BLACK');
    expect(isLegalMove(board, 2, 1, 'WHITE', 9)).toBe(false);
  });

  it('取り石があれば自殺手にならない', () => {
    // 隅(1,1)黒を白が囲んでいて、(1,1)の黒を取れる場合
    const board = createEmptyBoard(9);
    placeStone(board, 1, 1, 'BLACK');
    placeStone(board, 2, 1, 'WHITE');
    // (1,2)に白を打つと黒1子を取れるので合法
    expect(isLegalMove(board, 1, 2, 'WHITE', 9)).toBe(true);
  });

  it('取りがあれば隅でも合法', () => {
    const board = createEmptyBoard(9);
    placeStone(board, 2, 1, 'BLACK');
    placeStone(board, 1, 2, 'BLACK');
    placeStone(board, 3, 1, 'WHITE');
    placeStone(board, 2, 2, 'WHITE');
    placeStone(board, 1, 3, 'WHITE');
    expect(isLegalMove(board, 1, 1, 'WHITE', 9)).toBe(true);
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

  it('コウ禁止は参照ハッシュがあるときだけ効く', () => {
    const game = liveGame();
    const moves = koMoves();
    const boardAfterCapture = deriveBoardState(game, moves).boardState;
    const refHash = koReferenceHash(game, moves);

    expect(isLegalMove(boardAfterCapture, 5, 3, 'BLACK', 9)).toBe(true);
    expect(isLegalMove(boardAfterCapture, 5, 3, 'BLACK', 9, refHash)).toBe(false);
  });

  it('直前手がパスならコウの即取り返し形でも参照ハッシュで拒否されない', () => {
    const game = liveGame();
    const moves = [
      ...koMoves(),
      move(9, 0, 0, 'BLACK'),
    ];
    const boardAfterPass = deriveBoardState(game, moves).boardState;

    expect(isLegalMove(boardAfterPass, 5, 3, 'BLACK', 9, koReferenceHash(game, moves))).toBe(true);
  });
});

describe('koReferenceHash', () => {
  it('moves 0件なら undefined', () => {
    expect(koReferenceHash(liveGame(), [])).toBeUndefined();
  });

  it('直前手を除いた盤面のハッシュを返す', () => {
    const game = liveGame();
    const moves = [
      move(1, 3, 3, 'BLACK'),
      move(2, 5, 5, 'WHITE'),
    ];

    expect(koReferenceHash(game, moves)).toBe(
      boardHash(deriveBoardState(game, [moves[0]]).boardState),
    );
  });
});
