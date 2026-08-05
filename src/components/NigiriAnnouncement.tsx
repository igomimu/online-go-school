import { useEffect, useRef, useState } from 'react';
import GoStone from './GoStone';
import { NIGIRI_FLIP_INTERVALS, NIGIRI_SETTLE_DELAY, prefersReducedMotion } from '../utils/nigiri';

/**
 * 対局者の画面に出るニギリ。
 *
 * 先生がニギリを押した時点で結果ごと届き、こちらでも同じ間合いで石が止まる。
 * 視覚効果は本来この人たちのためのものなので、先生の画面と同じ待ち時間にしてある
 * （2026-08-05 三村さん）。止まってしばらくしたら自分で消える。
 */

const HOLD_AFTER_RESULT = 3200;

interface NigiriAnnouncementProps {
  /** 自分が黒番になったか */
  iAmBlack: boolean;
  /** 相手の表示名 */
  opponentName: string;
  onDone: () => void;
}

export default function NigiriAnnouncement({ iAmBlack, opponentName, onDone }: NigiriAnnouncementProps) {
  const [flipIndex, setFlipIndex] = useState<number | null>(0);
  const [settled, setSettled] = useState(false);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const push = (fn: () => void, ms: number) => timers.current.push(window.setTimeout(fn, ms));

    if (prefersReducedMotion()) {
      setFlipIndex(null);
      setSettled(true);
      push(onDone, HOLD_AFTER_RESULT);
    } else {
      let elapsed = 0;
      NIGIRI_FLIP_INTERVALS.forEach((interval, i) => {
        elapsed += interval;
        push(() => setFlipIndex(i % 2), elapsed);
      });
      push(() => { setFlipIndex(null); setSettled(true); }, elapsed + NIGIRI_SETTLE_DELAY);
      push(onDone, elapsed + NIGIRI_SETTLE_DELAY + HOLD_AFTER_RESULT);
    }

    const ids = timers.current;
    return () => { ids.forEach(id => window.clearTimeout(id)); };
    // マウント時に一度だけ。結果が変わるときは呼ぶ側が key で作り直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      data-testid="nigiri-announcement"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 px-4"
      role="status"
      aria-live="polite"
    >
      <div className="w-full max-w-xs rounded-lg border border-line bg-surface px-6 py-7 text-center shadow-2xl">
        <div className="text-sm text-muted">ニギリ</div>

        <div className="mt-4 flex justify-center">
          {settled
            ? <GoStone color={iAmBlack ? 'black' : 'white'} size={56} />
            : <GoStone color={flipIndex === 0 ? 'black' : 'white'} size={56} />}
        </div>

        <div className="mt-4 min-h-[3.5rem]">
          {settled ? (
            <>
              <div data-testid="nigiri-announcement-result" className="text-lg font-bold text-ink">
                {iAmBlack ? 'あなたの黒番です' : 'あなたは白番です'}
              </div>
              <div className="mt-1 text-sm text-muted">
                {opponentName} が{iAmBlack ? '白番' : '黒番'}
              </div>
            </>
          ) : (
            <div className="text-lg font-bold text-muted">黒白を決めています…</div>
          )}
        </div>
      </div>
    </div>
  );
}
