import { useEffect, useRef } from 'react';

export type PointerKind = 'mouse' | 'pen' | 'touch';

/**
 * 直前に触れた入力装置の種類。
 *
 * `(pointer: coarse)` の判定だけだと、タッチとマウス／ペンを両方持つ端末
 * （Surface のようなタブレットPC）が一律「タッチ端末」になってしまう。
 * マウスで操作していてもスマホ向けの手順に入り、1回で打てなくなる。
 * 実際に触れたポインタの種類を見れば、同じ端末でも指とペンを使い分けられる。
 *
 * state ではなく ref に持つ。着手のたびに読むだけで、これ自体で描き直す必要はない。
 */
export function useLastPointerType(): () => PointerKind | null {
  const ref = useRef<PointerKind | null>(null);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || e.pointerType === 'pen' || e.pointerType === 'touch') {
        ref.current = e.pointerType;
      }
    };
    // クリック処理より先に記録したいので capture 段階で拾う
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    return () => window.removeEventListener('pointerdown', onPointerDown, { capture: true });
  }, []);

  return () => ref.current;
}
