interface WinRateGraphProps {
  // Array of {moveNumber, winrate} data points
  data: { moveNumber: number; winrate: number }[];
  currentMove: number;
  onMoveClick?: (moveNumber: number) => void;
}

export default function WinRateGraph({
  data,
  currentMove,
  onMoveClick,
}: WinRateGraphProps) {
  if (data.length === 0) return null;

  const W = 300;
  const H = 80;
  const PAD = { top: 4, bottom: 4, left: 2, right: 2 };
  const graphW = W - PAD.left - PAD.right;
  const graphH = H - PAD.top - PAD.bottom;

  const maxMove = Math.max(data[data.length - 1].moveNumber, 1);

  const toX = (moveNum: number) => PAD.left + (moveNum / maxMove) * graphW;
  const toY = (winrate: number) => PAD.top + ((100 - winrate) / 100) * graphH;

  // Build SVG path
  const pathPoints = data.map(d => `${toX(d.moveNumber)},${toY(d.winrate)}`);
  const pathD = `M${pathPoints.join(' L')}`;

  // Current move marker
  const currentData = data.find(d => d.moveNumber === currentMove);
  const currentX = toX(currentMove);
  const currentY = currentData ? toY(currentData.winrate) : toY(50);

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onMoveClick) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = (clickX - PAD.left) / graphW;
    const moveNum = Math.round(ratio * maxMove);
    if (moveNum >= 0 && moveNum <= maxMove) {
      onMoveClick(moveNum);
    }
  };

  return (
    <div className="glass-panel p-2">
      <div className="text-xs text-zinc-500 mb-1">勝率グラフ</div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto cursor-pointer"
        onClick={handleClick}
      >
        {/* Background */}
        <rect x={PAD.left} y={PAD.top} width={graphW} height={graphH} fill="#1a1a2e" rx={2} />

        {/* 50% line */}
        <line
          x1={PAD.left} y1={toY(50)} x2={W - PAD.right} y2={toY(50)}
          stroke="#333" strokeWidth={0.5} strokeDasharray="4,4"
        />

        {/* Win rate line */}
        <path d={pathD} fill="none" stroke="#60a5fa" strokeWidth={1.5} strokeLinejoin="round" />

        {/* Fill area */}
        <path
          d={`${pathD} L${toX(data[data.length - 1].moveNumber)},${toY(0)} L${toX(data[0].moveNumber)},${toY(0)} Z`}
          fill="#60a5fa" opacity={0.1}
        />

        {/* Current position marker */}
        <line x1={currentX} y1={PAD.top} x2={currentX} y2={H - PAD.bottom} stroke="#fbbf24" strokeWidth={1} opacity={0.5} />
        {currentData && (
          <circle cx={currentX} cy={currentY} r={3} fill="#fbbf24" stroke="#000" strokeWidth={0.5} />
        )}

        {/* Labels */}
        <text x={PAD.left + 2} y={PAD.top + 8} fill="#666" fontSize={6}>黒</text>
        <text x={PAD.left + 2} y={H - PAD.bottom - 2} fill="#666" fontSize={6}>白</text>
      </svg>
    </div>
  );
}
