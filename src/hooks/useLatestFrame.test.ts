import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLatestFrame } from './useLatestFrame';

/**
 * 2026-08-26 実授業: 先生がホイールで早送りすると生徒側の盤が固まった。
 * 19路の碁盤は描き直しが重く、届くたびに描くと追いつかない。
 * 途中は捨てて最新だけを、決まった間隔で描けているかの回帰。
 */
describe('描き直しの間引き', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('立て続けに届いても、描き直しは間隔ごとに1回', () => {
    const { result } = renderHook(() => useLatestFrame<number>(80));

    act(() => { result.current[1](1); });
    // 最初の1枚はすぐ出す（止まって見えないように）
    expect(result.current[0]).toBe(1);

    act(() => {
      for (let i = 2; i <= 50; i++) result.current[1](i);
    });
    // まだ増えない
    expect(result.current[0]).toBe(1);

    act(() => { vi.advanceTimersByTime(80); });
    // 溜まった中の最後だけが出る
    expect(result.current[0]).toBe(50);
  });

  it('間隔をあけて届けば、そのつど描く', () => {
    const { result } = renderHook(() => useLatestFrame<number>(80));

    act(() => { result.current[1](1); });
    act(() => { vi.advanceTimersByTime(120); });
    act(() => { result.current[1](2); });

    expect(result.current[0]).toBe(2);
  });

  it('立て続けに50回届いても、描き直しは2回で済む', () => {
    const { result } = renderHook(() => useLatestFrame<number>(80));
    const seen: number[] = [];

    act(() => { result.current[1](1); });
    seen.push(result.current[0]!);

    act(() => { for (let i = 2; i <= 50; i++) result.current[1](i); });
    act(() => { vi.advanceTimersByTime(80); });
    seen.push(result.current[0]!);

    // 届いた50枚に対し、描いたのは最初の1枚と最後の1枚だけ
    expect(seen).toEqual([1, 50]);
  });
});
