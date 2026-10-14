import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveGameRow, LiveMoveRow } from '../utils/liveGameApi';
import { useLiveGame } from './useLiveGame';
import { fetchDeadStoneDraft } from '../utils/deadStoneDraft';

vi.mock('../utils/deadStoneDraft', () => ({ fetchDeadStoneDraft: vi.fn() }));

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
    api.enterScoring.mockReset().mockResolvedValue(undefined);
    api.updateDeadStones.mockReset().mockResolvedValue(undefined);
    api.submitMove.mockReset().mockResolvedValue({ ok: true });
    vi.mocked(fetchDeadStoneDraft).mockReset().mockResolvedValue([]);
    api.ensureRealtimeAuth.mockClear();
    api.subscribeLiveGame.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('講師は連続パスなしで整地へ進み死石の下書きを作る', async () => {
    api.fetchLiveGame.mockResolvedValue({ ...game, white_player: 'sid:white' });
    api.fetchLiveMoves.mockReset().mockResolvedValue([blackMove]);
    vi.mocked(fetchDeadStoneDraft).mockResolvedValue(['4,4']);
    const view = renderHook(() => useLiveGame('game-1', 'teacher', true));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { await view.result.current.enterScoring(); });
    expect(api.enterScoring).toHaveBeenCalledWith('game-1');
    expect(view.result.current.game?.status).toBe('scoring');
    expect(view.result.current.game?.scoring_confirmed).toEqual([]);
    expect(fetchDeadStoneDraft).toHaveBeenCalledTimes(1);
    expect(api.updateDeadStones).toHaveBeenCalledWith('game-1', ['4,4']);
    expect(api.submitMove).not.toHaveBeenCalled();
  });

  it('計算開始に失敗したら対局を続け下書きは作らない', async () => {
    api.enterScoring.mockRejectedValue(new Error('計算開始失敗'));
    const view = renderHook(() => useLiveGame('game-1', 'teacher', true));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { await view.result.current.enterScoring(); });
    expect(view.result.current.game?.status).toBe('playing');
    expect(view.result.current.error).toContain('計算開始失敗');
    expect(fetchDeadStoneDraft).not.toHaveBeenCalled();
  });

  it('講師の最後の着手の保存が済んでから計算へ進む', async () => {
    api.fetchLiveMoves.mockReset().mockResolvedValue([blackMove]);
    let finishMove!: (value: { ok: boolean }) => void;
    api.submitMove.mockReturnValueOnce(new Promise((resolve) => { finishMove = resolve; }));
    const view = renderHook(() => useLiveGame('game-1', 'teacher', true));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    let pendingMove!: Promise<void>;
    await act(async () => { pendingMove = view.result.current.submitMove(5, 5); });
    let pendingScoring!: Promise<void>;
    await act(async () => { pendingScoring = view.result.current.enterScoring(); });
    expect(api.enterScoring).not.toHaveBeenCalled();
    await act(async () => {
      finishMove({ ok: true });
      await pendingMove;
      await pendingScoring;
    });
    expect(api.enterScoring).toHaveBeenCalledTimes(1);
    expect(view.result.current.game?.status).toBe('scoring');
    expect(fetchDeadStoneDraft).toHaveBeenCalledWith(
      expect.anything(),
      expect.arrayContaining([expect.objectContaining({ x: 5, y: 5, color: 'WHITE' })]),
      expect.anything(),
      'BLACK',
    );
  });

  it('生徒は講師用の計算開始操作を使えない', async () => {
    const view = renderHook(() => useLiveGame('game-1', 'sid:black', false));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    await act(async () => { await view.result.current.enterScoring(); });
    expect(api.enterScoring).not.toHaveBeenCalled();
    expect(view.result.current.game?.status).toBe('playing');
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

  // 2026-09-07 Codex レビュー #3: 定期照合が着手一覧しか見ておらず、
  // 回線が切れている間の打ち掛け・再開・整地が復帰後も反映されなかった
  it('切断中に相手が打ち掛けにしても、定期照合で対局の状態に追いつく', async () => {
    api.fetchLiveGame.mockReset()
      .mockResolvedValueOnce(game)
      .mockResolvedValue({ ...game, status: 'interrupted', updated_at: '2026-08-23T00:05:00.000Z' });

    const view = renderHook(() => useLiveGame('game-1', 'teacher', true));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(view.result.current.game?.status).toBe('playing');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });

    expect(view.result.current.game?.status).toBe('interrupted');
  });

  // 2026-09-07 Codex レビュー #2: 相手の保存が失敗した手が、こちらの盤に残り続けていた
  it('相手から「保存できなかった」と届いたら、仮の石を消す', async () => {
    api.fetchLiveMoves.mockReset().mockResolvedValue([]);

    const view = renderHook(() => useLiveGame('game-1', 'sid:black', false));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // 相手が打った手が RTC で先に届く
    await act(async () => {
      window.dispatchEvent(new CustomEvent('live-game-message', {
        detail: {
          msg: { type: 'GAME_MOVE', payload: { gameId: 'game-1', x: 4, y: 4, color: 'BLACK', moveNumber: 1 } },
          sender: 'teacher',
        },
      }));
    });
    expect(view.result.current.moveNumber).toBe(1);

    // 相手側で保存に失敗した通知が届く
    await act(async () => {
      window.dispatchEvent(new CustomEvent('live-game-message', {
        detail: {
          msg: { type: 'GAME_MOVE_REJECTED', payload: { gameId: 'game-1', moveNumber: 1 } },
          sender: 'teacher',
        },
      }));
    });

    expect(view.result.current.moveNumber).toBe(0);
    expect(view.result.current.moves).toEqual([]);
  });
});
