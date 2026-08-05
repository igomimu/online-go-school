/**
 * ニギリ（黒白決め）の間合い。先生の画面と対局者の画面で同じ長さにする。
 *
 * 石が入れ替わる間隔をだんだん広げて止める。全部で 0.8 秒ほど。
 * 大げさな演出にはしない（2026-08-05 三村さん指定）。
 */
export const NIGIRI_FLIP_INTERVALS = [70, 80, 95, 115, 140, 175, 215, 265];

/** 最後の石が止まってから結果を出すまでの間 */
export const NIGIRI_SETTLE_DELAY = 160;

/** 押してから結果が出るまでの合計（ミリ秒） */
export function nigiriDrawDuration(): number {
  return NIGIRI_FLIP_INTERVALS.reduce((a, b) => a + b, 0) + NIGIRI_SETTLE_DELAY;
}

/** 端末が「動きを減らす」設定になっているか */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
