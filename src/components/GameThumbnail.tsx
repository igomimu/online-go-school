import type { GameSession } from '../types/game';

interface GameThumbnailProps {
  game: GameSession;
  onClick: () => void;
  isActive?: boolean;
}

export default function GameThumbnail({ game, onClick, isActive }: GameThumbnailProps) {
  const size = game.boardSize;
  const cellSize = 8;
  const totalSize = size * cellSize;

  return (
    <button
      onClick={onClick}
      className={`glass-panel p-2 hover:bg-white/5 transition-all ${
        isActive ? 'ring-2 ring-blue-500' : ''
      } ${game.status === 'finished' ? 'opacity-60' : ''}`}
    >
      {/* ミニ碁盤 */}
      <svg width={totalSize} height={totalSize} viewBox={`0 0 ${totalSize} ${totalSize}`}>
        <rect width={totalSize} height={totalSize} fill="#DCB35C" />
        {/* 線 */}
        {Array.from({ length: size }).map((_, i) => (
          <g key={i}>
            <line
              x1={cellSize / 2} y1={i * cellSize + cellSize / 2}
              x2={totalSize - cellSize / 2} y2={i * cellSize + cellSize / 2}
              stroke="black" strokeWidth={0.5}
            />
            <line
              x1={i * cellSize + cellSize / 2} y1={cellSize / 2}
              x2={i * cellSize + cellSize / 2} y2={totalSize - cellSize / 2}
              stroke="black" strokeWidth={0.5}
            />
          </g>
        ))}
        {/* 石 */}
        {game.boardState.map((row, y) =>
          row.map((cell, x) => {
            if (!cell) return null;
            return (
              <circle
                key={`${x}-${y}`}
                cx={x * cellSize + cellSize / 2}
                cy={y * cellSize + cellSize / 2}
                r={cellSize * 0.4}
                fill={cell.color === 'BLACK' ? '#000' : '#fff'}
                stroke="#000"
                strokeWidth={0.5}
              />
            );
          })
        )}
      </svg>

      {/* 情報 */}
      <div className="mt-2 text-xs text-left space-y-0.5">
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-black border border-white/20 inline-block" />
          <span className="truncate">{game.blackPlayer}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-white border border-white/20 inline-block" />
          <span className="truncate">{game.whitePlayer}</span>
        </div>
        <div className="text-zinc-500">
          {game.status === 'playing'
            ? `${game.moveNumber}手目`
            : game.result || '終局'}
        </div>
      </div>
    </button>
  );
}
