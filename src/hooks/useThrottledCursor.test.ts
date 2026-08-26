import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useThrottledCursor } from './useThrottledCursor';

/**
 * 碁盤のカーソル共有は交点をまたぐたびに呼ばれる。そのまま送ると
 * RealtimeKit の送信上限に当たり、超えた時点から先の配信が丸ごと止まる
 * （2026-08-26 実授業）。ここは「何回呼ばれても送る回数は抑える」ことの回帰。
 */
describe('カーソルの間引き', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('連続で呼んでも、間隔ごとに1回しか送らない', () => {
    const send = vi.fn();
    const { result } = renderHook(() => useThrottledCursor<{ x: number; y: number }>(send, 100));

    // 碁盤を横切る勢いで20回
    act(() => {
      for (let i = 1; i <= 20; i++) result.current.push({ x: i, y: 1 });
    });

    // 最初の1回はすぐ出る
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenLastCalledWith({ x: 1, y: 1 });

    act(() => { vi.advanceTimersByTime(100); });

    // 溜まった分は最後の位置だけ
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith({ x: 20, y: 1 });
  });

  it('間隔をあけて呼べば、そのつど送る', () => {
    const send = vi.fn();
    const { result } = renderHook(() => useThrottledCursor<{ x: number; y: number }>(send, 100));

    act(() => { result.current.push({ x: 1, y: 1 }); });
    act(() => { vi.advanceTimersByTime(150); });
    act(() => { result.current.push({ x: 2, y: 2 }); });

    expect(send).toHaveBeenCalledTimes(2);
  });

  it('cancelPending すると、溜まっていた分は送らない', () => {
    const send = vi.fn();
    const { result } = renderHook(() => useThrottledCursor<{ x: number; y: number }>(send, 100));

    act(() => {
      result.current.push({ x: 1, y: 1 });
      result.current.push({ x: 2, y: 2 });
    });
    expect(send).toHaveBeenCalledTimes(1);

    // 盤から出たので「消す」を優先したい
    act(() => { result.current.cancelPending(); });
    act(() => { vi.advanceTimersByTime(200); });

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('1秒間に送る回数が、上限より十分少ない', () => {
    const send = vi.fn();
    const { result } = renderHook(() => useThrottledCursor<{ x: number; y: number }>(send, 100));

    // 16msごと（マウスの移動なみ）に1秒ぶん
    act(() => {
      for (let t = 0; t < 1000; t += 16) {
        result.current.push({ x: t, y: 1 });
        vi.advanceTimersByTime(16);
      }
    });

    // 100ms間隔なら最大でも11回程度。RealtimeKit の既定上限(5回/秒)を上げた
    // 60回/秒に対して十分な余裕がある
    expect(send.mock.calls.length).toBeLessThanOrEqual(12);
    expect(send.mock.calls.length).toBeGreaterThan(5);
  });
});
