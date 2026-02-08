import GoBoard from './GoBoard';
import type { GameSession } from '../types/game';
import type { StoneColor } from './GoBoard';
import { Flag, SkipForward } from 'lucide-react';

interface GameBoardProps {
  game: GameSession;
  myIdentity: string;
  onMove: (gameId: string, x: number, y: number, color: StoneColor) => void;
  onPass: (gameId: string, color: StoneColor) => void;
  onResign: (gameId: string, color: StoneColor) => void;
  onBack?: () => void;
  isTeacher?: boolean;
}

export default function GameBoard({
  game,
  myIdentity,
  onMove,
  onPass,
  onResign,
  onBack,
  isTeacher,
}: GameBoardProps) {
  const isBlack = game.blackPlayer === myIdentity;
  const isWhite = game.whitePlayer === myIdentity;
  const isParticipant = isBlack || isWhite;
  const isMyTurn = isParticipant && (
    (isBlack && game.currentColor === 'BLACK') ||
    (isWhite && game.currentColor === 'WHITE')
  );
  const myColor: StoneColor | null = isBlack ? 'BLACK' : isWhite ? 'WHITE' : null;

  const handleCellClick = (x: number, y: number) => {
    if (!isMyTurn && !isTeacher) return;
    // 先生は対局中のどちらの色でも着手できる
    const color = isTeacher ? game.currentColor : myColor;
    if (!color) return;
    onMove(game.id, x, y, color);
  };

  const handlePass = () => {
    if (!isMyTurn && !isTeacher) return;
    const color = isTeacher ? game.currentColor : myColor;
    if (!color) return;
    onPass(game.id, color);
  };

  const handleResign = () => {
    if (!isParticipant && !isTeacher) return;
    const color = isTeacher ? game.currentColor : myColor;
    if (!color) return;
    if (confirm('投了しますか？')) {
      onResign(game.id, color);
    }
  };

  return (
    <div className="space-y-4">
      {/* 対局情報ヘッダー */}
      <div className="glass-panel px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {onBack && (
            <button onClick={onBack} className="text-zinc-500 hover:text-white text-sm">
              &larr; 戻る
            </button>
          )}
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-black border border-white/20" />
            <span className={game.currentColor === 'BLACK' ? 'font-bold text-white' : 'text-zinc-400'}>
              {game.blackPlayer}
            </span>
            <span className="text-zinc-600 text-sm">取{game.blackCaptures}</span>
          </div>
          <span className="text-zinc-600">vs</span>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-white border border-white/20" />
            <span className={game.currentColor === 'WHITE' ? 'font-bold text-white' : 'text-zinc-400'}>
              {game.whitePlayer}
            </span>
            <span className="text-zinc-600 text-sm">取{game.whiteCaptures}</span>
          </div>
        </div>
        <div className="text-sm text-zinc-500">
          {game.status === 'playing'
            ? `${game.moveNumber}手目`
            : `終局: ${game.result}`}
        </div>
      </div>

      {/* 碁盤 */}
      <div className="glass-panel p-4 flex justify-center">
        <GoBoard
          boardState={game.boardState}
          boardSize={game.boardSize}
          onCellClick={game.status === 'playing' ? handleCellClick : undefined}
          readOnly={game.status !== 'playing' || (!isMyTurn && !isTeacher)}
        />
      </div>

      {/* 操作ボタン */}
      {game.status === 'playing' && (isParticipant || isTeacher) && (
        <div className="flex justify-center gap-3">
          {(isMyTurn || isTeacher) && (
            <button
              onClick={handlePass}
              className="secondary-button flex items-center gap-2 text-sm"
            >
              <SkipForward className="w-4 h-4" /> パス
            </button>
          )}
          <button
            onClick={handleResign}
            className="secondary-button flex items-center gap-2 text-sm border-red-500/20 hover:bg-red-500/10 hover:text-red-400"
          >
            <Flag className="w-4 h-4" /> 投了
          </button>
        </div>
      )}

      {/* ターン表示 */}
      {game.status === 'playing' && (
        <div className="text-center text-sm text-zinc-500">
          {isMyTurn ? (
            <span className="text-blue-400 font-bold">あなたの番です</span>
          ) : isParticipant ? (
            '相手の番です'
          ) : (
            `${game.currentColor === 'BLACK' ? game.blackPlayer : game.whitePlayer}の番`
          )}
        </div>
      )}
    </div>
  );
}
