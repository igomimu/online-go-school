import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { createRef } from 'react';
import VerticalResizer from './VerticalResizer';
import { useStoredHeight } from './useStoredHeight';

describe('useStoredHeight', () => {
  beforeEach(() => localStorage.clear());

  it('触っていないうちは null（中身なりの高さ）', () => {
    const { result } = renderHook(() => useStoredHeight('roster', 72, 640));
    expect(result.current.height).toBeNull();
  });

  it('変えた高さを覚え、次に開いたときも使う', () => {
    const { result } = renderHook(() => useStoredHeight('roster', 72, 640));
    act(() => result.current.save(180));
    expect(localStorage.getItem('ogs.height.roster')).toBe('180');

    const again = renderHook(() => useStoredHeight('roster', 72, 640));
    expect(again.result.current.height).toBe(180);
  });

  it('上限と下限からはみ出さない', () => {
    const { result } = renderHook(() => useStoredHeight('roster', 72, 640));
    act(() => result.current.commit(10));
    expect(result.current.height).toBe(72);
    act(() => result.current.commit(9999));
    expect(result.current.height).toBe(640);
  });
});

describe('VerticalResizer', () => {
  function setup() {
    const onResize = vi.fn();
    const onCommit = vi.fn();
    const ref = createRef<HTMLDivElement>();
    render(
      <>
        <div ref={ref} data-testid="pane" />
        <VerticalResizer targetRef={ref} onResize={onResize} onCommit={onCommit} label="生徒一覧の高さ" />
      </>
    );
    // jsdom は実寸を返さないので、掴んだ瞬間の高さを固定しておく
    vi.spyOn(screen.getByTestId('pane'), 'getBoundingClientRect').mockReturnValue({ height: 200 } as DOMRect);
    return { onResize, onCommit };
  }

  it('下へドラッグすると、その分だけ高くする', () => {
    const { onResize, onCommit } = setup();
    const handle = screen.getByTestId('resizer-生徒一覧の高さ');
    fireEvent.pointerDown(handle, { clientY: 100 });
    fireEvent.pointerMove(window, { clientY: 160 });
    expect(onResize).toHaveBeenLastCalledWith(260);
    fireEvent.pointerUp(window);
    expect(onCommit).toHaveBeenCalledWith(260);
  });

  it('矢印キーでも動かせる', () => {
    const { onResize, onCommit } = setup();
    const handle = screen.getByTestId('resizer-生徒一覧の高さ');
    fireEvent.keyDown(handle, { key: 'ArrowUp' });
    expect(onResize).toHaveBeenLastCalledWith(184);
    expect(onCommit).toHaveBeenLastCalledWith(184);
  });
});
