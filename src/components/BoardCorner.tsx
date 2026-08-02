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

export default function BoardCorner({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className={className}
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      <defs>
        {/* 木目は 512px のテクスチャを原寸で並べる。引き伸ばすと縞が太くなり木に見えない */}
        <pattern id="board-corner-wood" patternUnits="userSpaceOnUse" width="512" height="512">
          <image href="/wood-board-texture-v2.webp" x="0" y="0" width="512" height="512" />
        </pattern>
        {/* 盤は画面の外へ続いているように、右と下を背景色へ溶かす */}
        <linearGradient id="board-corner-fade-x" x1="0" y1="0" x2="1" y2="0">
          <stop offset="30%" stopColor="#15140f" stopOpacity="0" />
          <stop offset="100%" stopColor="#15140f" stopOpacity="1" />
        </linearGradient>
        <linearGradient id="board-corner-fade-y" x1="0" y1="0" x2="0" y2="1">
          <stop offset="30%" stopColor="#15140f" stopOpacity="0" />
          <stop offset="100%" stopColor="#15140f" stopOpacity="1" />
        </linearGradient>
      </defs>

      <rect x="0" y="0" width={SIZE} height={SIZE} fill="url(#board-corner-wood)" />
      {/* 背景装飾なので沈める。ここが明るいとフォームより先に目に入ってしまう */}
      <rect x="0" y="0" width={SIZE} height={SIZE} fill="#15140f" opacity="0.42" />

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

      <rect x="0" y="0" width={SIZE} height={SIZE} fill="url(#board-corner-fade-x)" />
      <rect x="0" y="0" width={SIZE} height={SIZE} fill="url(#board-corner-fade-y)" />
    </svg>
  );
}
