import { describe, expect, it } from 'vitest';
import { deriveLiveBoardSnapshots } from './useLiveBoards';
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
});
