/**
 * ログイン画面の装飾: 碁盤の左上の隅。
 *
 * 石は置かない。定石として成立しない配置を九段に見せるリスクを避けるためと、
 * 「これから打つ場所」というログイン画面の意味に空盤が合うため。
 * 木目は対局盤と同じ静的テクスチャを使い、罫線・星も対局盤と同じ黒で描く。
 */
const CELL = 44;
const EDGE = 30; // 盤の外縁から1線まで
const LINES = 13; // 見せる路数（19路盤の左上13路ぶん）
const SIZE = EDGE + CELL * (LINES - 1) + 40;

/** 19路盤の星のうち、この範囲に入るもの（隅・辺・天元） */
const STAR_POINTS = [
  [3, 3],
  [3, 9],
  [9, 3],
  [9, 9],
] as const;

const linePos = (i: number) => EDGE + i * CELL;

/** 木目テクスチャの原寸。引き伸ばすと縞が太くなり木に見えないので、この大きさで並べる */
const WOOD_TILE = 512;
/** 盤を地の色へ溶かし始める位置（従来の linearGradient の 30% と同じ） */
const FADE_START = 0.3;
/** 溶かしを段で近似する数。多いほど滑らか、24 段で段差は 4% */
const FADE_BANDS = 24;

/**
 * 地の色へ溶かす帯。linearGradient(url(#…)) を使わないのは、SVG の url(#…) 参照を
 * 解決できない端末があるため（2026-09-08、碁石の塗りが乗らなかったのと同じ根）。
 * 参照が効かないと溶けずに盤が四角く切れて見えてしまう。
 */
function fadeBands(axis: 'x' | 'y') {
  return Array.from({ length: FADE_BANDS }, (_, i) => {
    const from = FADE_START + (1 - FADE_START) * (i / FADE_BANDS);
    const to = FADE_START + (1 - FADE_START) * ((i + 1) / FADE_BANDS);
    // 帯の境目に筋が出ないよう、次の帯へ少しだけ食い込ませる
    const span = (to - from) * SIZE + 0.5;
    const start = from * SIZE;
    const opacity = (i + 0.5) / FADE_BANDS;
    return axis === 'x'
      ? <rect key={`fade-x-${i}`} x={start} y={0} width={span} height={SIZE} fill="var(--color-ground)" opacity={opacity} />
      : <rect key={`fade-y-${i}`} x={0} y={start} width={SIZE} height={span} fill="var(--color-ground)" opacity={opacity} />;
  });
}

export default function BoardCorner({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className={className}
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      {/* 木目は 512px のテクスチャを原寸で並べる。pattern(url(#…)) を使わないのは
          その参照を解決できない端末があるため。viewBox の外へ出た分は切り取られる */}
      {[0, WOOD_TILE].map(ty => [0, WOOD_TILE].map(tx => (
        <image key={`wood-${tx}-${ty}`} href="/wood-board-texture-v2.webp"
          x={tx} y={ty} width={WOOD_TILE} height={WOOD_TILE} />
      )))}
      {/* 背景装飾なので地の色でかぶせて沈める。暗い地なら暗く、明るい地なら淡く木目が残る
          （ここが強いとフォームより先に目に入ってしまう） */}
      <rect x="0" y="0" width={SIZE} height={SIZE} fill="var(--color-ground)" opacity="0.42" />

      <g stroke="black" strokeWidth={1.5} strokeLinecap="square" shapeRendering="geometricPrecision">
        {Array.from({ length: LINES }, (_, i) => (
          <line key={`v-${i}`} x1={linePos(i)} y1={EDGE} x2={linePos(i)} y2={SIZE} />
        ))}
        {Array.from({ length: LINES }, (_, i) => (
          <line key={`h-${i}`} x1={EDGE} y1={linePos(i)} x2={SIZE} y2={linePos(i)} />
        ))}
      </g>

      {STAR_POINTS.map(([sx, sy]) => (
        <circle key={`star-${sx}-${sy}`} cx={linePos(sx)} cy={linePos(sy)} r={3.5} fill="black" />
      ))}

      {/* 盤は画面の外へ続いているように、右と下を地の色へ溶かす。
          溶かす先を墨で決め打つと、明るい地のときに黒い矩形が浮いて見出しを潰す */}
      {fadeBands('x')}
      {fadeBands('y')}
    </svg>
  );
}
