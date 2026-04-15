import { useCallback, useMemo, useState } from 'react';
import GoBoard from './GoBoard';
import { Flag, SkipForward, Check } from 'lucide-react';
import { calculateTerritory, formatScoringResult } from '../utils/scoring';
import { findGroup } from '../utils/gameLogic';
import { useLiveGame } from '../hooks/useLiveGame';

interface GameBoardProps {
  gameId: string;
  myIdentity: string;
  isTeacher?: boolean;
  onBack?: () => void;
}

export default function GameBoard({ gameId, myIdentity, isTeacher, onBack }: GameBoardProps) {
  const live = useLiveGame(gameId, myIdentity);
  const {
    game,
    boardState,
    currentColor,
    moveNumber,
    blackCaptures,
    whiteCaptures,
    isMyTurn,
    isParticipant,
    loading,
    error,
    submitMove,
    submitPass,
    submitResign,
    setDeadStones,
    finishWithResult,
  } = live;

  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);

  const isScoring = game?.status === 'scoring';
  const canPlay = game?.status === 'playing' && (isMyTurn || isTeacher);

  const deadStonesSet = useMemo(
    () => new Set(game?.scoring_dead_stones ?? []),
    [game?.scoring_dead_stones],
  );

  const scoringResult = useMemo(() => {
    if (!isScoring || !game) return null;
    return calculateTerritory(
      boardState,
      game.board_size,
      deadStonesSet,
      blackCaptures,
      whiteCaptures,
      game.komi,
    );
  }, [isScoring, game, boardState, deadStonesSet, blackCaptures, whiteCaptures]);

  const handleCellClick = useCallback(
    (x: number, y: number) => {
      if (!game) return;
      if (isScoring) {
        if (!isTeacher) return;
        const stone = boardState[y - 1]?.[x - 1];
        if (!stone) return;
        const group = findGroup(boardState, x - 1, y - 1, stone.color, game.board_size);
        const currentDead = new Set(game.scoring_dead_stones ?? []);
        const firstKey = `${x},${y}`;
        const isCurrentlyDead = currentDead.has(firstKey);
        for (const pos of group) {
          const k = `${pos.x + 1},${pos.y + 1}`;
          if (isCurrentlyDead) currentDead.delete(k);
          else currentDead.add(k);
        }
        setDeadStones(Array.from(currentDead));
        return;
      }
      if (!isMyTurn && !isTeacher) return;
      // 先生は常に currentColor で打つ（指導対局で代打ちできる）
      // 生徒は myColor === currentColor のときのみ到達
      submitMove(x, y);
    },
    [game, isScoring, isTeacher, boardState, isMyTurn, submitMove, setDeadStones],
  );

  const handlePassClick = useCallback(() => {
    if (!isMyTurn && !isTeacher) return;
    submitPass();
  }, [isMyTurn, isTeacher, submitPass]);

  const handleResignClick = useCallback(() => {
    if (!isParticipant && !isTeacher) return;
    if (confirm('投了しますか？')) submitResign();
  }, [isParticipant, isTeacher, submitResign]);

  const handleScoringConfirm = useCallback(() => {
    if (!scoringResult) return;
    const resultStr = formatScoringResult(scoringResult);
    finishWithResult(resultStr);
  }, [scoringResult, finishWithResult]);

  if (loading || !game) {
    return (
      <div className="glass-panel p-8 text-center text-zinc-500">
        {error ? <span className="text-red-400">エラー: {error}</span> : '対局を読み込み中...'}
      </div>
    );
  }

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
            <span className={currentColor === 'BLACK' ? 'font-bold text-white' : 'text-zinc-400'}>
              {game.black_player}
            </span>
            <span className="text-zinc-600 text-sm">取{blackCaptures}</span>
          </div>
          <span className="text-zinc-600">vs</span>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-white border border-white/20" />
            <span className={currentColor === 'WHITE' ? 'font-bold text-white' : 'text-zinc-400'}>
              {game.white_player}
            </span>
            <span className="text-zinc-600 text-sm">取{whiteCaptures}</span>
          </div>
        </div>
        <div data-testid="move-count" className="text-sm text-zinc-500">
          {game.status === 'playing'
            ? `${moveNumber}手目`
            : game.status === 'scoring'
              ? '整地中'
              : `終局: ${game.result ?? ''}`}
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="glass-panel px-3 py-2 text-sm text-red-400 bg-red-500/5">
          {error}
        </div>
      )}

      {/* 碁盤 */}
      <div className="glass-panel p-4 flex justify-center">
        <GoBoard
          boardState={boardState}
          boardSize={game.board_size}
          onCellClick={
            isScoring
              ? isTeacher
                ? handleCellClick
                : undefined
              : game.status === 'playing'
                ? handleCellClick
                : undefined
          }
          readOnly={
            isScoring
              ? !isTeacher
              : game.status !== 'playing' || (!isMyTurn && !isTeacher)
          }
          onCellMouseEnter={canPlay ? (x, y) => setGhostPos({ x, y }) : undefined}
          onCellMouseLeave={canPlay ? () => setGhostPos(null) : undefined}
          ghostPosition={canPlay ? ghostPos : null}
          ghostColor={canPlay ? currentColor : undefined}
          territoryMap={scoringResult?.territoryMap}
          deadStones={deadStonesSet.size > 0 ? deadStonesSet : undefined}
        />
      </div>

      {/* 整地モード */}
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
                  地{scoringResult.blackTerritory} + 取{blackCaptures + scoringResult.deadWhiteStones}
                </div>
              </div>
              <div className="text-center">
                <div className="text-zinc-400">白</div>
                <div className="text-white font-bold text-lg">{scoringResult.whiteTotal}</div>
                <div className="text-zinc-600 text-xs">
                  地{scoringResult.whiteTerritory} + 取{whiteCaptures + scoringResult.deadBlackStones} + コミ{game.komi}
                </div>
              </div>
              <div className="text-center">
                <div className="text-zinc-400">結果</div>
                <div className="text-blue-400 font-bold text-lg">{formatScoringResult(scoringResult)}</div>
              </div>
            </div>
          </div>
          {isTeacher && (
            <div className="flex justify-center gap-3">
              <button onClick={handleScoringConfirm} className="premium-button flex items-center gap-2 text-sm">
                <Check className="w-4 h-4" /> 確定
              </button>
            </div>
          )}
        </div>
      )}

      {/* 操作ボタン */}
      {game.status === 'playing' && (isParticipant || isTeacher) && (
        <div className="flex justify-center gap-3">
          {(isMyTurn || isTeacher) && (
            <button
              onClick={handlePassClick}
              className="secondary-button flex items-center gap-2 text-sm"
            >
              <SkipForward className="w-4 h-4" /> パス
            </button>
          )}
          <button
            onClick={handleResignClick}
            className="secondary-button flex items-center gap-2 text-sm border-red-500/20 hover:bg-red-500/10 hover:text-red-400"
          >
            <Flag className="w-4 h-4" /> 投了
          </button>
        </div>
      )}

      {/* ターン表示 */}
      {game.status === 'playing' && (
        <div data-testid="turn-indicator" className="text-center text-sm text-zinc-500">
          {isMyTurn ? (
            <span className="text-blue-400 font-bold">あなたの番です</span>
          ) : isParticipant ? (
            '相手の番です'
          ) : (
            `${currentColor === 'BLACK' ? game.black_player : game.white_player}の番`
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
