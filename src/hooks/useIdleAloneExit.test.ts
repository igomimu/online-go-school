import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIdleAloneExit } from './useIdleAloneExit';

const TIMEOUT = 15 * 60 * 1000;

describe('useIdleAloneExit', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('一人きりで無操作のまま時間が来たら出る', () => {
    const onIdle = vi.fn();
    renderHook(() => useIdleAloneExit({ active: true, onIdle, timeoutMs: TIMEOUT }));

    act(() => void vi.advanceTimersByTime(TIMEOUT - 1000));
    expect(onIdle).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(60 * 1000));
    expect(onIdle).toHaveBeenCalled();
  });

  it('触っていれば出ない（無操作の起点が押し戻される）', () => {
    const onIdle = vi.fn();
    renderHook(() => useIdleAloneExit({ active: true, onIdle, timeoutMs: TIMEOUT }));

    // 期限の手前で一度触る
    act(() => void vi.advanceTimersByTime(TIMEOUT - 60 * 1000));
    act(() => void window.dispatchEvent(new Event('pointerdown')));

    // 元の期限を跨いでも出ない
    act(() => void vi.advanceTimersByTime(2 * 60 * 1000));
    expect(onIdle).not.toHaveBeenCalled();

    // 触ってから改めて時間が経てば出る
    act(() => void vi.advanceTimersByTime(TIMEOUT));
    expect(onIdle).toHaveBeenCalled();
  });

  it('授業中（active=false）は何もしない', () => {
    const onIdle = vi.fn();
    renderHook(() => useIdleAloneExit({ active: false, onIdle, timeoutMs: TIMEOUT }));

    act(() => void vi.advanceTimersByTime(TIMEOUT * 3));
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('誰か入ってきて active が下りたら、その後は出ない', () => {
    const onIdle = vi.fn();
    const { rerender } = renderHook(
      ({ active }) => useIdleAloneExit({ active, onIdle, timeoutMs: TIMEOUT }),
      { initialProps: { active: true } },
    );

    act(() => void vi.advanceTimersByTime(TIMEOUT - 60 * 1000));
    rerender({ active: false });
    act(() => void vi.advanceTimersByTime(TIMEOUT * 2));
    expect(onIdle).not.toHaveBeenCalled();
  });

  it('外したあとに監視が残らない', () => {
    const onIdle = vi.fn();
    const { unmount } = renderHook(() => useIdleAloneExit({ active: true, onIdle, timeoutMs: TIMEOUT }));

    unmount();
    act(() => void vi.advanceTimersByTime(TIMEOUT * 2));
    expect(onIdle).not.toHaveBeenCalled();
  });
});
