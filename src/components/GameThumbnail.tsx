import type { GameSession } from '../types/game';
import type { Student } from '../types/classroom';
import { getDisplayName } from '../utils/identityUtils';

interface GameThumbnailProps {
  game: GameSession;
  onClick: () => void;
  isActive?: boolean;
  students?: Student[];
  onResume?: (gameId: string) => void;
}

export default function GameThumbnail({ game, onClick, isActive, students = [], onResume }: GameThumbnailProps) {
  const size = game.boardSize;
  const cellSize = 8;
  const totalSize = size * cellSize;

  const blackName = getDisplayName(game.blackPlayer, students);
  const whiteName = getDisplayName(game.whitePlayer, students);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
      className={`glass-panel p-2 hover:bg-white/5 transition-all ${
        isActive ? 'ring-2 ring-blue-500' : ''
      } ${game.status === 'finished' || game.status === 'interrupted' ? 'opacity-60' : ''}`}
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
          <span className="truncate">{blackName}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-white border border-white/20 inline-block" />
          <span className="truncate">{whiteName}</span>
        </div>
        <div className="text-zinc-500 flex justify-between items-center gap-1">
          <span>
            {game.status === 'playing'
              ? `${game.moveNumber}手目`
              : game.status === 'interrupted'
                ? '中断'
                : game.result || '終局'}
          </span>
          {game.status === 'interrupted' && onResume && (
            <button
              onClick={e => {
                e.stopPropagation();
                onResume(game.id);
              }}
              className="px-1.5 py-0.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded text-[10px] font-bold"
            >
              再開
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
