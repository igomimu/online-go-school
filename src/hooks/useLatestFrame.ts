import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 立て続けに届く「最新の状態」を、画面の描き直しが追いつく速さに落とす。
 *
 * 2026-08-26 実授業: 先生がマウスホイールで手順を早送りすると、生徒側の盤が
 * 固まった。盤面は受け取るたびに即座に描き直していたが、19路の碁盤は
 * 描き直しが重く、毎秒何十回も来ると処理が追いつかない。
 *
 * 途中の局面は見えなくてよい（早送りの最中に一手ずつ読む人はいない）。
 * 決まった間隔でその時点の最新だけを描けば、動きは滑らかなまま軽くなる。
 */
export const FRAME_INTERVAL_MS = 80;

export function useLatestFrame<T>(intervalMs: number = FRAME_INTERVAL_MS): [T | null, (value: T) => void] {
  const [shown, setShown] = useState<T | null>(null);
  const pending = useRef<{ value: T } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAt = useRef(0);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const push = useCallback((value: T) => {
    const waited = Date.now() - lastAt.current;
    if (waited >= intervalMs && !timer.current) {
      lastAt.current = Date.now();
      setShown(value);
      return;
    }
    pending.current = { value };
    if (!timer.current) {
      timer.current = setTimeout(() => {
        timer.current = null;
        const next = pending.current;
        pending.current = null;
        if (!next) return;
        lastAt.current = Date.now();
        setShown(next.value);
      }, Math.max(0, intervalMs - waited));
    }
  }, [intervalMs]);

  return [shown, push];
}
