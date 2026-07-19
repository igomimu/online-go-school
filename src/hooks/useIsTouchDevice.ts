import { useEffect, useState } from 'react';

function matches(): boolean {
  return typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false);
}

/** タッチ主体の入力デバイスか判定する（マウス操作は pointer:fine、指タップは pointer:coarse）。 */
export function useIsTouchDevice(): boolean {
  const [isTouch, setIsTouch] = useState(matches);

  useEffect(() => {
    const mq = window.matchMedia?.('(pointer: coarse)');
    if (!mq) return;
    const handler = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);

  return isTouch;
}
