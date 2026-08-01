import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameNode } from '../utils/treeUtilsV2';
import { useAiAnalysis } from './useAiAnalysis';

const analyzePositionMock = vi.hoisted(() => vi.fn());

vi.mock('../utils/katagoClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/katagoClient')>();
  return {
    ...actual,
    analyzePosition: analyzePositionMock,
    loadAiSettings: () => ({ enabled: true, maxVisits: 1000 }),
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
  topMoves: [],
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
    let resolveAnalysis: (value: typeof result) => void = () => {};
    analyzePositionMock.mockImplementation(() => new Promise(resolve => {
      resolveAnalysis = resolve;
    }));

    const { rerender } = renderHook(
      ({ moveHistory }) => useAiAnalysis(node, moveHistory, { boardSize: 9, komi: 6.5 }),
      { initialProps: { moveHistory: [] as { x: number; y: number; color: 'BLACK' | 'WHITE' }[] } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(analyzePositionMock).toHaveBeenCalledTimes(1);

    rerender({ moveHistory: [] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(analyzePositionMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveAnalysis(result);
      await Promise.resolve();
    });
  });

  it('局面の内容が変わった場合は新しい解析を送信する', async () => {
    analyzePositionMock.mockResolvedValue(result);
    const firstMove = { x: 5, y: 5, color: 'BLACK' as const };
    const { rerender } = renderHook(
      ({ moveHistory }) => useAiAnalysis(node, moveHistory, { boardSize: 9, komi: 6.5 }),
      { initialProps: { moveHistory: [] as { x: number; y: number; color: 'BLACK' | 'WHITE' }[] } },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    expect(analyzePositionMock).toHaveBeenCalledTimes(1);

    rerender({ moveHistory: [firstMove] });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(analyzePositionMock).toHaveBeenCalledTimes(2);
    expect(analyzePositionMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ moves: [['B', 'E5']] }),
      expect.any(AbortSignal),
    );
  });
});
