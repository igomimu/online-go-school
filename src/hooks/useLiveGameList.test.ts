import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveGameRow } from '../utils/liveGameApi';
import { useLiveGameList } from './useLiveGameList';

const api = vi.hoisted(() => ({
  fetchLiveGames: vi.fn(),
  createLiveGame: vi.fn(),
  ensureRealtimeAuth: vi.fn(),
  subscribeClassroomGames: vi.fn(),
  callbacks: null as null | {
    onInsert: (row: LiveGameRow) => void;
    onUpdate: (row: LiveGameRow) => void;
    onDelete: (row: LiveGameRow) => void;
  },
  unsubscribe: vi.fn(),
}));

vi.mock('../utils/liveGameApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/liveGameApi')>();
  return {
    ...actual,
    fetchLiveGames: api.fetchLiveGames,
    createLiveGame: api.createLiveGame,
    ensureRealtimeAuth: api.ensureRealtimeAuth,
    subscribeClassroomGames: api.subscribeClassroomGames,
  };
});

function game(overrides: Partial<LiveGameRow> = {}): LiveGameRow {
  return {
    id: 'game-1',
    classroom_id: 'classroom-1',
    black_player: 'sid:1001',
    white_player: 'sid:1002',
    board_size: 19,
    handicap: 0,
    komi: 6.5,
    status: 'playing',
    result: null,
    scoring_dead_stones: [],
    clock: null,
    undo_request: null,
    created_at: '2026-08-15T00:00:00.000Z',
    updated_at: '2026-08-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('useLiveGameList finishedGameEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.callbacks = null;
    api.fetchLiveGames.mockResolvedValue([game()]);
    api.ensureRealtimeAuth.mockResolvedValue(undefined);
    api.subscribeClassroomGames.mockImplementation((_classroomId, callbacks) => {
      api.callbacks = callbacks;
      return { unsubscribe: api.unsubscribe };
    });
  });

  it('新しい終局だけを1回通知し、再開後の再終局はもう一度通知する', async () => {
    const { result } = renderHook(() => useLiveGameList('classroom-1'));
    await waitFor(() => expect(api.callbacks).not.toBeNull());

    const finished = game({ status: 'finished', result: 'B+R' });
    act(() => api.callbacks?.onUpdate(finished));
    expect(result.current.finishedGameEvent).toEqual({ sequence: 1, game: finished });
    expect(result.current.games).toHaveLength(0);

    // 同じfinished更新が重複しても、通知イベントを増やさない。
    act(() => api.callbacks?.onUpdate({ ...finished, updated_at: '2026-08-15T00:01:00.000Z' }));
    expect(result.current.finishedGameEvent?.sequence).toBe(1);

    act(() => api.callbacks?.onUpdate(game({ status: 'playing' })));
    act(() => api.callbacks?.onUpdate(finished));
    expect(result.current.finishedGameEvent?.sequence).toBe(2);
  });

  it('画面を開いた時点で既に終わっている対局は通知しない', async () => {
    api.fetchLiveGames.mockResolvedValue([game({ status: 'finished', result: 'W+T' })]);
    const { result } = renderHook(() => useLiveGameList('classroom-1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.finishedGameEvent).toBeNull();
  });
});
