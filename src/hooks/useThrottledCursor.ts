import { useCallback, useEffect, useRef } from 'react';

/**
 * カーソルのような「落ちてよい・最新だけ届けばよい」通信を間引く。
 *
 * 碁盤のカーソル共有は交点をまたぐたびに送るので、先生がマウスを走らせると
 * 毎秒10〜20回になる。RealtimeKit は送信の回数に上限があり、超えた分は
 * 黙って捨てられるのではなく例外になる。呼び出し側が握りつぶしていると
 * 「ある時点から相手に何も届かない」形で出る（2026-08-26 実授業）。
 *
 * 最初の1回はすぐ送り、その後は間隔をあけて最後の値だけ送る。
 * 人の目には十分滑らかで、送信回数は毎秒10回に収まる。
 */
export const CURSOR_INTERVAL_MS = 100;

export function useThrottledCursor<T>(
  send: (value: T) => void,
  intervalMs: number = CURSOR_INTERVAL_MS,
) {
  const sendRef = useRef(send);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);

  const lastSentAt = useRef(0);
  const pending = useRef<T | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const push = useCallback((value: T) => {
    const waited = Date.now() - lastSentAt.current;
    if (waited >= intervalMs && !timer.current) {
      lastSentAt.current = Date.now();
      sendRef.current(value);
      return;
    }
    pending.current = value;
    if (!timer.current) {
      timer.current = setTimeout(() => {
        timer.current = null;
        const next = pending.current;
        pending.current = null;
        if (next === null) return;
        lastSentAt.current = Date.now();
        sendRef.current(next);
      }, Math.max(0, intervalMs - waited));
    }
  }, [intervalMs]);

  /** 「消す」など、間引いた値より優先して確実に送りたいとき */
  const cancelPending = useCallback(() => {
    pending.current = null;
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  return { push, cancelPending };
}
