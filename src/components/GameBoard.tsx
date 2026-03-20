import { useMemo, useState } from 'react';
import GoBoard from './GoBoard';
import type { GameSession } from '../types/game';
import type { StoneColor } from './GoBoard';
import { Flag, SkipForward, Check, Clock } from 'lucide-react';
import { calculateTerritory, formatScoringResult } from '../utils/scoring';
import { formatTime } from '../hooks/useGameClock';

interface GameBoardProps {
  game: GameSession;
  myIdentity: string;
  onMove: (gameId: string, x: number, y: number, color: StoneColor) => void;
  onPass: (gameId: string, color: StoneColor) => void;
  onResign: (gameId: string, color: StoneColor) => void;
  onBack?: () => void;
  isTeacher?: boolean;
  onScoringToggle?: (gameId: string, x: number, y: number) => void;
  onScoringConfirm?: (gameId: string) => void;
}

export default function GameBoard({
  game,
  myIdentity,
  onMove,
  onPass,
  onResign,
  onBack,
  isTeacher,
  onScoringToggle,
  onScoringConfirm,
}: GameBoardProps) {
  const isBlack = game.blackPlayer === myIdentity;
  const isWhite = game.whitePlayer === myIdentity;
  const isParticipant = isBlack || isWhite;
  const isMyTurn = isParticipant && (
    (isBlack && game.currentColor === 'BLACK') ||
    (isWhite && game.currentColor === 'WHITE')
  );
  const myColor: StoneColor | null = isBlack ? 'BLACK' : isWhite ? 'WHITE' : null;
  const isScoring = game.status === 'scoring';
  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const canPlay = game.status === 'playing' && (isMyTurn || isTeacher);

  // Scoring state
  const deadStonesSet = useMemo(() =>
    new Set(game.scoringDeadStones || []),
    [game.scoringDeadStones]
  );

  const scoringResult = useMemo(() => {
    if (!isScoring) return null;
    return calculateTerritory(
      game.boardState, game.boardSize, deadStonesSet,
      game.blackCaptures, game.whiteCaptures, game.komi,
    );
  }, [isScoring, game.boardState, game.boardSize, deadStonesSet, game.blackCaptures, game.whiteCaptures, game.komi]);

  const handleCellClick = (x: number, y: number) => {
    if (isScoring) {
      // In scoring mode: toggle dead stones (teacher only)
      if (isTeacher && onScoringToggle) {
        onScoringToggle(game.id, x, y);
      }
      return;
    }
    if (!isMyTurn && !isTeacher) return;
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
            : game.status === 'scoring'
              ? '整地中'
              : `終局: ${game.result}`}
        </div>
      </div>

      {/* 対局時計 */}
      {game.clock && game.status === 'playing' && (
        <div className="glass-panel px-4 py-2 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-zinc-500" />
            <span className="w-3 h-3 rounded-full bg-black border border-white/20" />
            <span className={`font-mono font-bold ${
              game.clock.blackTimeLeft <= 10 && game.currentColor === 'BLACK'
                ? 'text-red-400 animate-pulse' : 'text-white'
            }`}>
              {formatTime(game.clock.blackTimeLeft)}
              {game.clock.byoyomiPeriods > 0 && (
                <span className="text-zinc-500 text-xs ml-1">({game.clock.blackByoyomiLeft})</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-white border border-white/20" />
            <span className={`font-mono font-bold ${
              game.clock.whiteTimeLeft <= 10 && game.currentColor === 'WHITE'
                ? 'text-red-400 animate-pulse' : 'text-white'
            }`}>
              {formatTime(game.clock.whiteTimeLeft)}
              {game.clock.byoyomiPeriods > 0 && (
                <span className="text-zinc-500 text-xs ml-1">({game.clock.whiteByoyomiLeft})</span>
              )}
            </span>
          </div>
          {game.clock.lastTickTime === null && (
            <span className="text-yellow-400 text-xs">一時停止中</span>
          )}
        </div>
      )}

      {/* 碁盤 */}
      <div className="glass-panel p-4 flex justify-center">
        <GoBoard
          boardState={game.boardState}
          boardSize={game.boardSize}
          onCellClick={
            isScoring
              ? (isTeacher ? handleCellClick : undefined)
              : (game.status === 'playing' ? handleCellClick : undefined)
          }
          readOnly={
            isScoring
              ? !isTeacher
              : (game.status !== 'playing' || (!isMyTurn && !isTeacher))
          }
          onCellMouseEnter={canPlay ? (x, y) => setGhostPos({ x, y }) : undefined}
          onCellMouseLeave={canPlay ? () => setGhostPos(null) : undefined}
          ghostPosition={canPlay ? ghostPos : null}
          ghostColor={canPlay ? game.currentColor : undefined}
          territoryMap={scoringResult?.territoryMap}
          deadStones={deadStonesSet.size > 0 ? deadStonesSet : undefined}
        />
      </div>

      {/* 整地モード: 得点表示 + 操作ボタン */}
      {isScoring && scoringResult && (
        <div className="space-y-3">
          <div className="glass-panel px-4 py-3">
            <div className="text-center text-sm font-bold text-yellow-400 mb-2">
              整地モード {isTeacher ? '— 死石をクリックしてマークしてください' : '— 先生が整地中です'}
            </div>
            <div className="flex justify-center gap-8 text-sm">
              <div className="text-center">
                <div className="text-zinc-400">黒</div>
                <div className="text-white font-bold text-lg">{scoringResult.blackTotal}</div>
                <div className="text-zinc-600 text-xs">
                  地{scoringResult.blackTerritory} + 取{game.blackCaptures + scoringResult.deadWhiteStones}
                </div>
              </div>
              <div className="text-center">
                <div className="text-zinc-400">白</div>
                <div className="text-white font-bold text-lg">{scoringResult.whiteTotal}</div>
                <div className="text-zinc-600 text-xs">
                  地{scoringResult.whiteTerritory} + 取{game.whiteCaptures + scoringResult.deadBlackStones} + コミ{game.komi}
                </div>
              </div>
              <div className="text-center">
                <div className="text-zinc-400">結果</div>
                <div className="text-blue-400 font-bold text-lg">{formatScoringResult(scoringResult)}</div>
              </div>
            </div>
          </div>
          {isTeacher && onScoringConfirm && (
            <div className="flex justify-center gap-3">
              <button
                onClick={() => onScoringConfirm(game.id)}
                className="premium-button flex items-center gap-2 text-sm"
              >
                <Check className="w-4 h-4" /> 確定
              </button>
            </div>
          )}
        </div>
      )}

      {/* 操作ボタン (playing mode) */}
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

      {/* 終局結果 */}
      {game.status === 'finished' && game.result && (
        <div className="text-center text-sm text-zinc-400">
          結果: <span className="text-white font-bold">{game.result}</span>
        </div>
      )}
    </div>
  );
}
