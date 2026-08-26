import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameNode } from '../utils/treeUtilsV2';
import { useAiAnalysis, toBlackWinrate } from './useAiAnalysis';

const analyzePositionMock = vi.hoisted(() => vi.fn());

vi.mock('../utils/katagoClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/katagoClient')>();
  return {
    ...actual,
    analyzePosition: analyzePositionMock,
    loadAiSettings: () => ({ enabled: true, maxVisits: 3000, allowStudentInteraction: false }),
    saveAiSettings: vi.fn(),
  };
});

const node: GameNode = {
  id: 'node-1',
  parent: null,
  children: [],
  board: Array.from({ length: 9 }, () => Array(9).fill(null)),
  nextNumber: 1,
  activeColor: 'WHITE',
  boardSize: 9,
  markers: [],
};

const result = {
  winrate: 52.3,
  scoreLead: 1.2,
  topMoves: [{ move: 'D4', winrate: 54, scoreLead: 2.5, visits: 1000, pv: ['D4'] }],
};

describe('useAiAnalysis', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    analyzePositionMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('同じ局面の配列参照が変わっても解析リクエストを重複送信しない', async () => {
    analyzePositionMock.mockResolvedValue(result);

    const { rerender } = renderHook(
      ({ moveHistory }) => useAiAnalysis(node, moveHistory, { boardSize: 9, komi: 6.5 }),
      { initialProps: { moveHistory: [] as { x: number; y: number; color: 'BLACK' | 'WHITE' }[] } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(analyzePositionMock).toHaveBeenCalledTimes(2);
    expect(analyzePositionMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ maxVisits: 10 }),
      expect.any(AbortSignal),
    );
    expect(analyzePositionMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ maxVisits: 3000 }),
      expect.any(AbortSignal),
    );

    rerender({ moveHistory: [] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(analyzePositionMock).toHaveBeenCalledTimes(2);
  });

  it('局面の内容が変わった場合は新しい解析を送信する', async () => {
    analyzePositionMock.mockResolvedValue(result);
    const firstMove = { x: 5, y: 5, color: 'BLACK' as const };
    const { rerender } = renderHook(
      ({ moveHistory }) => useAiAnalysis(node, moveHistory, { boardSize: 9, komi: 6.5 }),
      { initialProps: { moveHistory: [] as { x: number; y: number; color: 'BLACK' | 'WHITE' }[] } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(analyzePositionMock).toHaveBeenCalledTimes(2);

    rerender({ moveHistory: [firstMove] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(analyzePositionMock).toHaveBeenCalledTimes(4);
    expect(analyzePositionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ moves: [['B', 'E5']] }),
      expect.any(AbortSignal),
    );
  });

  it('OFFにすると進行中の解析を中断してローディング表示を止める', async () => {
    let receivedSignal: AbortSignal | undefined;
    analyzePositionMock.mockImplementation((_request, signal: AbortSignal) => {
      receivedSignal = signal;
      return new Promise(() => {});
    });

    const { result: hook } = renderHook(() => (
      useAiAnalysis(node, [], { boardSize: 9, komi: 6.5 })
    ));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(hook.current.isLoading).toBe(true);

    act(() => hook.current.updateSettings({ enabled: false }));

    expect(receivedSignal?.aborted).toBe(true);
    expect(hook.current.isLoading).toBe(false);
    expect(hook.current.result).toBeNull();
  });

  it('生徒端末ではKataGoへ解析リクエストを送らない', async () => {
    renderHook(() => useAiAnalysis(node, [], { boardSize: 9, komi: 6.5, active: false }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(analyzePositionMock).not.toHaveBeenCalled();
  });

  /**
   * 2026-08-26: 8/15 の 9e1619d でここを「黒基準へ反転」させてしまい、白番の局面で
   * 候補手の数字が相手から見た値になって、どちらが有利なのか読めなくなった。
   * KataGo の値は手番の側から見たもので、そのまま出すのが正しい。
   * 黒が10目良い局面なら、黒番では +10、白番では -10。
   */
  it('白番のKataGo応答を手番基準のまま返し、棋譜のコミと初期石を送る', async () => {
    analyzePositionMock.mockResolvedValue(result);
    const { result: hook } = renderHook(() => useAiAnalysis(node, [], {
      boardSize: 9,
      komi: 0.5,
      toPlay: 'WHITE',
      initialStones: [
        { x: 3, y: 3, color: 'BLACK' },
        { x: 7, y: 7, color: 'BLACK' },
      ],
    }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(analyzePositionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        komi: 0.5,
        initialStones: [['B', 'C7'], ['B', 'G3']],
      }),
      expect.any(AbortSignal),
    );
    // 反転しない。白番なら「白から見て 52.3%・+1.2目」がそのまま出る
    expect(hook.current.result).toEqual(expect.objectContaining({
      winrate: 52.3,
      scoreLead: 1.2,
      topMoves: [expect.objectContaining({ winrate: 54, scoreLead: 2.5 })],
    }));
    expect(hook.current.toPlay).toBe('WHITE');
  });

  it('黒番でも白番でも、返る値に手を加えない', async () => {
    analyzePositionMock.mockResolvedValue(result);
    const { result: hook } = renderHook(() => useAiAnalysis(node, [], {
      boardSize: 9, komi: 6.5, toPlay: 'BLACK',
    }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(hook.current.result).toEqual(expect.objectContaining({
      winrate: 52.3,
      scoreLead: 1.2,
    }));
    expect(hook.current.toPlay).toBe('BLACK');
  });
});

/**
 * 勝率グラフだけは黒基準。手番ごとに折れ線が反転すると形勢の推移が読めない。
 */
describe('toBlackWinrate', () => {
  it('黒番はそのまま、白番は裏返す', () => {
    expect(toBlackWinrate(62.3, 'BLACK')).toBe(62.3);
    expect(toBlackWinrate(62.3, 'WHITE')).toBeCloseTo(37.7, 5);
  });
});
