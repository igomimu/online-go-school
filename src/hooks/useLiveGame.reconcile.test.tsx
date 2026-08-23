import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveGameRow, LiveMoveRow } from '../utils/liveGameApi';
import { useLiveGame } from './useLiveGame';

const api = vi.hoisted(() => ({
  fetchLiveGame: vi.fn(),
  fetchLiveMoves: vi.fn(),
  ensureRealtimeAuth: vi.fn(() => Promise.resolve()),
  subscribeLiveGame: vi.fn(() => ({ unsubscribe: vi.fn() })),
  submitMove: vi.fn(),
  enterScoring: vi.fn(),
  updateDeadStones: vi.fn(),
  finishGame: vi.fn(),
  resetLiveGame: vi.fn(),
  interruptGame: vi.fn(),
  resumeLiveGame: vi.fn(),
  requestUndo: vi.fn(),
  respondUndo: vi.fn(),
}));

vi.mock('../utils/liveGameApi', () => api);

const game: LiveGameRow = {
  id: 'game-1',
  classroom_id: 'class-1',
  black_player: 'sid:black',
  white_player: 'teacher',
  board_size: 19,
  handicap: 0,
  komi: 6.5,
  status: 'playing',
  result: null,
  scoring_dead_stones: [],
  clock: null,
  undo_request: null,
  created_at: '2026-08-23T00:00:00.000Z',
  updated_at: '2026-08-23T00:00:00.000Z',
};

const blackMove: LiveMoveRow = {
  game_id: 'game-1',
  move_number: 1,
  x: 4,
  y: 4,
  color: 'BLACK',
  player_id: 'sid:black',
  created_at: '2026-08-23T00:00:01.000Z',
};

describe('useLiveGame の着手再照合', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.fetchLiveGame.mockReset().mockResolvedValue(game);
    api.fetchLiveMoves.mockReset()
      .mockResolvedValueOnce([])
      .mockResolvedValue([blackMove]);
    api.ensureRealtimeAuth.mockClear();
    api.subscribeLiveGame.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('Realtime INSERTとgames UPDATEを両方取り逃しても定期照合で相手の手へ追いつく', async () => {
    const view = renderHook(() => useLiveGame('game-1', 'teacher', true));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view.result.current.moveNumber).toBe(0);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(view.result.current.moveNumber).toBe(1);
    expect(view.result.current.currentColor).toBe('WHITE');
    expect(view.result.current.lastMove).toEqual(blackMove);
  });
});
