import type { GameSession } from '../types/game';
import type { Student } from '../types/classroom';
import { getDisplayName } from '../utils/identityUtils';
import { isTimeoutResult } from '../utils/scoring';

interface GameThumbnailProps {
  game: GameSession;
  onClick: () => void;
  isActive?: boolean;
  isMyTurn?: boolean;
  turnLabel?: string;
  students?: Student[];
  onResume?: (gameId: string) => void;
  /** 時間切れで終わった対局の再開を許可する（講師のみ true） */
  allowTimeoutResume?: boolean;
}

export default function GameThumbnail({ game, onClick, isActive, isMyTurn, turnLabel, students = [], onResume, allowTimeoutResume }: GameThumbnailProps) {
  const size = game.boardSize;
  const cellSize = 8;
  const totalSize = size * cellSize;

  const blackName = getDisplayName(game.blackPlayer, students);
  const whiteName = getDisplayName(game.whitePlayer, students);

  // 中断は本人も再開できる（回線復旧）。時間切れ終局からの再開は講師のみ。
  const isTimedOut = game.status === 'finished' && isTimeoutResult(game.result);
  const canResume = !!onResume && (game.status === 'interrupted' || (isTimedOut && !!allowTimeoutResume));

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
      className={`glass-panel p-2 transition-all hover:bg-sumi-high ${
        isMyTurn ? 'ring-2 ring-kaya' : isActive ? 'ring-2 ring-nibi' : ''
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
                data-stone={`${x + 1}-${y + 1}`}
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
        <div className="flex items-center justify-between gap-1 text-nibi">
          <span className="tabular">
            {game.status === 'playing'
              ? `${game.moveNumber}手目`
              : game.status === 'interrupted'
                ? '中断'
                : isTimedOut
                  ? '時間切れ'
                  : game.result || '終局'}
          </span>
          {canResume && (
            <button
              onClick={e => {
                e.stopPropagation();
                if (isTimedOut && !confirm('時間切れで終わったこの対局を再開しますか？（切れた側の時間は戻します）')) return;
                onResume!(game.id);
              }}
              className="rounded bg-kaya px-1.5 py-0.5 text-[10px] font-bold text-sumi"
            >
              再開
            </button>
          )}
        </div>
        {turnLabel && (
          <div className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-bold ${
            isMyTurn ? 'bg-kaya text-sumi' : 'bg-sumi-high text-nibi'
          }`}>
            {turnLabel}
          </div>
        )}
      </div>
    </div>
  );
}
