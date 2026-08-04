import { useEffect, useRef, useState } from 'react';

/**
 * 上下の境目をつまんで高さを変える取っ手。
 *
 * 教室ホームは「生徒一覧・カメラ・チャット」を縦に積んでいるが、どれをどれだけ
 * 見たいかは場面と窓の大きさで変わる。固定の配分だと、窓を小さくしたときに
 * 会話が1行しか見えないといったことが起きる（三村さん報告 2026-08-04）。
 */
interface Props {
  /** 上にある、高さを変えたい要素。今の実寸を起点にする（中身なりの高さでも掴める） */
  targetRef: React.RefObject<HTMLDivElement | null>;
  onResize: (next: number) => void;
  onCommit: (next: number) => void;
  label: string;
}

export default function VerticalResizer({ targetRef, onResize, onCommit, label }: Props) {
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const latestRef = useRef(0);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const next = d.startHeight + (e.clientY - d.startY);
      latestRef.current = next;
      onResize(next);
    };
    const onUp = () => {
      setDragging(false);
      dragRef.current = null;
      onCommit(latestRef.current);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, onResize, onCommit]);

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label={label}
      tabIndex={0}
      data-testid={`resizer-${label}`}
      onPointerDown={(e) => {
        e.preventDefault();
        const current = targetRef.current?.getBoundingClientRect().height ?? 0;
        latestRef.current = current;
        dragRef.current = { startY: e.clientY, startHeight: current };
        setDragging(true);
      }}
      // キーボードでも動かせるようにする（つまむ操作ができない人向け）
      onKeyDown={(e) => {
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        const current = targetRef.current?.getBoundingClientRect().height ?? 0;
        const next = current + (e.key === 'ArrowDown' ? 16 : -16);
        latestRef.current = next;
        onResize(next);
        onCommit(next);
      }}
      style={{
        flexShrink: 0,
        height: 7,
        cursor: 'row-resize',
        touchAction: 'none',
        background: dragging ? 'var(--color-accent)' : 'var(--color-line)',
        transition: dragging ? undefined : 'background-color .15s ease-in-out',
      }}
      title={`${label}（上下にドラッグ、矢印キーでも動きます）`}
    />
  );
}
