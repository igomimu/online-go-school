import { describe, expect, it } from 'vitest';
import { applyLiveBoardSnapshotsToSessions, deriveLiveBoardSnapshots } from './useLiveBoards';
import { createEmptyBoard } from '../utils/gameLogic';
import type { GameSession } from '../types/game';
import type { LiveGameRow, LiveMoveRow } from '../utils/liveGameApi';

function game(overrides: Partial<LiveGameRow>): LiveGameRow {
  return {
    id: 'game-1',
    classroom_id: 'classroom-1',
    black_player: 'sid:a',
    white_player: 'teacher',
    board_size: 9,
    handicap: 0,
    komi: 6.5,
    status: 'playing',
    result: null,
    scoring_dead_stones: [],
    clock: null,
    created_at: '2026-07-10T00:00:00.000Z',
    updated_at: '2026-07-10T00:00:00.000Z',
    ...overrides,
  };
}

function move(overrides: Partial<LiveMoveRow>): LiveMoveRow {
  return {
    game_id: 'game-1',
    move_number: 1,
    x: 4,
    y: 4,
    color: 'BLACK',
    player_id: 'sid:a',
    created_at: '2026-07-10T00:01:00.000Z',
    ...overrides,
  };
}

describe('deriveLiveBoardSnapshots', () => {
  it('複数対局の盤面・手番・手数を deriveBoardState 経由で導出する', () => {
    const games = [
      game({ id: 'game-a', board_size: 9 }),
      game({ id: 'game-b', board_size: 13 }),
      game({ id: 'game-c', board_size: 19, handicap: 2, komi: 0.5 }),
    ];
    const boards = deriveLiveBoardSnapshots(games, [
      move({ game_id: 'game-a', move_number: 1, x: 3, y: 3, color: 'BLACK' }),
      move({ game_id: 'game-a', move_number: 2, x: 4, y: 3, color: 'WHITE', player_id: 'teacher' }),
      move({ game_id: 'game-b', move_number: 1, x: 5, y: 5, color: 'BLACK' }),
    ]);

    const a = boards.get('game-a')!;
    expect(a.moveNumber).toBe(2);
    expect(a.currentColor).toBe('BLACK');
    expect(a.boardState[2][2]?.color).toBe('BLACK');
    expect(a.boardState[2][3]?.color).toBe('WHITE');

    const b = boards.get('game-b')!;
    expect(b.moveNumber).toBe(1);
    expect(b.currentColor).toBe('WHITE');
    expect(b.boardState[4][4]?.color).toBe('BLACK');

    const c = boards.get('game-c')!;
    expect(c.moveNumber).toBe(0);
    expect(c.currentColor).toBe('WHITE');
    expect(c.boardState.flat().filter(Boolean)).toHaveLength(2);
  });

  it('GameSessionプレースホルダへ実盤面スナップショットを反映する', () => {
    const sessions: GameSession[] = [{
      id: 'game-a',
      blackPlayer: 'sid:a',
      whitePlayer: 'teacher',
      boardSize: 9,
      handicap: 0,
      komi: 6.5,
      status: 'playing',
      boardState: createEmptyBoard(9),
      currentColor: 'BLACK',
      moveNumber: 0,
      moveHistory: [],
      blackCaptures: 0,
      whiteCaptures: 0,
    }];
    const boards = deriveLiveBoardSnapshots(
      [game({ id: 'game-a', board_size: 9 })],
      [move({ game_id: 'game-a', move_number: 1, x: 3, y: 3, color: 'BLACK' })],
    );

    const hydrated = applyLiveBoardSnapshotsToSessions(sessions, boards);

    expect(hydrated[0].moveNumber).toBe(1);
    expect(hydrated[0].currentColor).toBe('WHITE');
    expect(hydrated[0].boardState[2][2]?.color).toBe('BLACK');
  });
});

/**
 * 2026-08-26 の実授業で「対局中、ホーム画面の碁盤だけ盤面がズレていた」。
 *
 * このフックは最初の取得と Realtime の購読しか持っておらず、その二つの間に
 * 打たれた手も、購読が切れている間の手も拾えなかった。対局盤のほうは games の
 * 更新を合図にした再取得と3秒ごとの照合を持っていたので、ホーム画面でだけ出た。
 */
describe('手が欠けたときの盤', () => {
  it('途中の一手が欠けると、取られたはずの石が盤に残る', () => {
    // 黒が白一子を取る形。9路の隅で E1(白)を黒が囲む
    const all = [
      move({ move_number: 1, x: 5, y: 9, color: 'BLACK' }),   // E1
      move({ move_number: 2, x: 4, y: 9, color: 'WHITE', player_id: 'teacher' }), // D1
      move({ move_number: 3, x: 3, y: 9, color: 'BLACK' }),   // C1
      move({ move_number: 4, x: 1, y: 1, color: 'WHITE', player_id: 'teacher' }),
      move({ move_number: 5, x: 4, y: 8, color: 'BLACK' }),   // D2 → D1の白を取る
    ];
    const games = [game({ id: 'game-1', board_size: 9 })];

    const complete = deriveLiveBoardSnapshots(games, all).get('game-1')!;
    expect(complete.boardState[8][3]).toBeNull(); // D1の白は取られている

    // 3手目が届かなかった場合、白は取られず盤に残ったままになる。
    // 手数は最大の move_number から出すので正しいままで、盤だけが狂う。
    // 「手数は合っているのに盤がズレている」という見え方になる
    const missing = all.filter(m => m.move_number !== 3);
    const broken = deriveLiveBoardSnapshots(games, missing).get('game-1')!;
    expect(broken.boardState[8][3]?.color).toBe('WHITE');
  });
});
