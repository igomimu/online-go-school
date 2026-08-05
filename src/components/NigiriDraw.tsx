import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * ニギリ（黒白決め）。互先のときだけ出る。
 *
 * 押した瞬間に答えを出すと味気ないので、石が数回入れ替わってから止まる。
 * 大げさな演出にはしない（間は 0.8 秒ほど、動くのは石と名前だけ 2026-08-05 三村さん指定）。
 *
 * 対局者の組み合わせが変わったら結果を捨てたいので、呼ぶ側が**順序に依らないキー**を
 * 付けて作り直す（ニギリで黒白が入れ替わっただけでは消えないように）。
 */

/** 石が入れ替わる間隔。だんだん遅くして止まる */
const FLIP_INTERVALS = [70, 80, 95, 115, 140, 175, 215, 265];

interface NigiriDrawProps {
  /** 対局者2人（identity） */
  candidates: [string, string];
  displayName: (identity: string) => string;
  /** 黒番に決まった側を返す */
  onDecided: (blackIdentity: string) => void;
}

/** 那智黒・蛤に寄せた小さな碁石 */
function Stone({ color }: { color: 'black' | 'white' }) {
  return (
    <span
      aria-hidden
      className="inline-block h-6 w-6 rounded-full"
      style={
        color === 'black'
          ? {
              background: 'radial-gradient(circle at 33% 28%, #6b6862 0%, #23211c 45%, #0d0c0a 100%)',
              boxShadow: '0 1px 2px rgba(0,0,0,.45)',
            }
          : {
              background: 'radial-gradient(circle at 33% 28%, #ffffff 0%, #f0ece2 55%, #cdc7b8 100%)',
              boxShadow: '0 1px 2px rgba(0,0,0,.3)',
            }
      }
    />
  );
}

export default function NigiriDraw({ candidates, displayName, onDecided }: NigiriDrawProps) {
  // 抽選中に表になっている側（0/1）。止まっているときは null
  const [flipIndex, setFlipIndex] = useState<number | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  const clearTimers = useCallback(() => {
    timers.current.forEach(id => window.clearTimeout(id));
    timers.current = [];
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const draw = () => {
    if (drawing) return;
    const winner = candidates[Math.random() < 0.5 ? 0 : 1];

    const reduceMotion = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      setResult(winner);
      onDecided(winner);
      return;
    }

    setDrawing(true);
    setResult(null);
    let elapsed = 0;
    FLIP_INTERVALS.forEach((interval, i) => {
      elapsed += interval;
      timers.current.push(window.setTimeout(() => setFlipIndex(i % 2), elapsed));
    });
    timers.current.push(window.setTimeout(() => {
      setDrawing(false);
      setFlipIndex(null);
      setResult(winner);
      onDecided(winner);
    }, elapsed + 160));
  };

  return (
    <div className="rounded-lg border border-line bg-raised/60 px-3 py-2.5">
      <div className="flex items-center gap-3">
        <button
          type="button"
          data-testid="nigiri-button"
          onClick={draw}
          disabled={drawing}
          className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-sm font-bold text-accent-ink transition-colors duration-150 hover:bg-accent/85 disabled:opacity-60"
        >
          ニギリ
        </button>

        <div className="flex min-w-0 flex-1 items-center gap-2">
          {drawing ? (
            <>
              <Stone color={flipIndex === 0 ? 'black' : 'white'} />
              <span
                data-testid="nigiri-flipping"
                className="truncate text-sm text-muted transition-opacity duration-150"
              >
                {displayName(candidates[flipIndex === 0 ? 0 : 1])}
              </span>
            </>
          ) : result ? (
            <>
              <Stone color="black" />
              <span data-testid="nigiri-result" className="truncate text-sm font-bold text-ink">
                {displayName(result)} の黒番
              </span>
            </>
          ) : (
            <span className="truncate text-sm text-muted">押すと黒番を決めます</span>
          )}
        </div>
      </div>
    </div>
  );
}
