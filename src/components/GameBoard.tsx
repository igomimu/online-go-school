import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import GoBoard from './GoBoard';
import type { Drawing } from './GoBoard';
import { Flag, SkipForward, Check, RefreshCw, X, Pen, ArrowRight as ArrowRightIcon, Trash2 } from 'lucide-react';
import { calculateTerritory, formatScoringResult } from '../utils/scoring';
import { findGroup } from '../utils/gameLogic';
import { formatTime } from '../hooks/useGameClock';
import { useLiveGame } from '../hooks/useLiveGame';
import { getSupabase } from '../utils/liveGameApi';
import { resolvePlayerName } from '../utils/identityUtils';
import { ClassroomLiveKit } from '../utils/classroomLiveKit';
import type { Student } from '../types/classroom';

interface GameBoardProps {
  gameId: string;
  myIdentity: string;
  isTeacher?: boolean;
  onBack?: () => void;
  onMoveSubmitted?: () => void;
  classroom?: ClassroomLiveKit | null;
  students?: Student[];  // 対局者名を解決するための名簿（IDは一切表示しない）
  syncedDrawings?: Drawing[];
}

export default function GameBoard(props: GameBoardProps) {
  return <GameBoardContent key={props.gameId} {...props} />;
}

function GameBoardContent({ gameId, myIdentity, isTeacher, onBack, onMoveSubmitted, classroom, students = [], syncedDrawings = [] }: GameBoardProps) {
  const live = useLiveGame(gameId, myIdentity, !!isTeacher, classroom);
  const {
    game,
    boardState,
    currentColor,
    moveNumber,
    blackCaptures,
    whiteCaptures,
    isMyTurn,
    isParticipant,
    clock,
    loading,
    error,
    submitMove,
    submitPass,
    submitResign,
    setDeadStones,
    finishWithResult,
    resetGame,
  } = live;

  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [drawMode, setDrawMode] = useState<'off' | 'line' | 'arrow'>('off');
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const drawLastCell = useRef<{ x: number; y: number } | null>(null);

  const isScoring = game?.status === 'scoring';
  // 着手できるのは手番の対局者本人のみ。対局中の代打ちは（先生でも）一切不可。
  const canPlay = game?.status === 'playing' && isMyTurn;
  const isDrawing = !!isTeacher && drawMode !== 'off';
  const effectiveDrawings = isTeacher ? drawings : syncedDrawings;

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
    async (x: number, y: number) => {
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
      if (!isMyTurn) return;
      // 手番の対局者本人のみ着手できる（代打ち不可）。
      await submitMove(x, y);
      onMoveSubmitted?.();
    },
    [game, isScoring, isTeacher, boardState, isMyTurn, submitMove, setDeadStones, onMoveSubmitted],
  );

  const handlePassClick = useCallback(async () => {
    if (!isMyTurn) return;
    await submitPass();
    onMoveSubmitted?.();
  }, [isMyTurn, submitPass, onMoveSubmitted]);

  const handleResignClick = useCallback(() => {
    // 投了は手番の対局者本人のみ
    if (!isMyTurn) return;
    if (confirm('投了しますか？')) submitResign();
  }, [isMyTurn, submitResign]);

  const handleScoringConfirm = useCallback(() => {
    if (!scoringResult) return;
    const resultStr = formatScoringResult(scoringResult);
    finishWithResult(resultStr);
  }, [scoringResult, finishWithResult]);

  const broadcastDrawings = useCallback((nextDrawings: Drawing[]) => {
    classroom?.broadcast({ type: 'DRAW_UPDATE', payload: nextDrawings });
  }, [classroom]);

  const handleDrawDragStart = useCallback((x: number, y: number) => {
    if (!isDrawing) return;
    setDrawStart({ x, y });
    drawLastCell.current = { x, y };
  }, [isDrawing]);

  const handleDrawDragMove = useCallback((x: number, y: number) => {
    if (!isDrawing) return;
    drawLastCell.current = { x, y };
  }, [isDrawing]);

  const handleDrawDragEnd = useCallback(() => {
    if (!isDrawing || !drawStart || !drawLastCell.current) return;

    const end = drawLastCell.current;
    if (drawStart.x !== end.x || drawStart.y !== end.y) {
      const nextDrawing: Drawing = {
        fromX: drawStart.x,
        fromY: drawStart.y,
        toX: end.x,
        toY: end.y,
        type: drawMode,
      };
      setDrawings(prev => {
        const updated = [...prev, nextDrawing];
        broadcastDrawings(updated);
        return updated;
      });
    }
    setDrawStart(null);
    drawLastCell.current = null;
  }, [broadcastDrawings, drawMode, drawStart, isDrawing]);

  const handleClearDrawings = useCallback(() => {
    setDrawings([]);
    setDrawMode('off');
    drawLastCell.current = null;
    setDrawStart(null);
    classroom?.broadcast({ type: 'DRAW_CLEAR', payload: null });
  }, [classroom]);

  // 対局終了/中断時に自動で閉じる（結果を確認できるよう一律で猶予を置く）
  useEffect(() => {
    if (game && (game.status === 'finished' || game.status === 'interrupted') && onBack) {
      const timer = setTimeout(() => {
        onBack();
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [game?.status, game?.result, onBack]);

  if (loading || !game) {
    return (
      <div className="glass-panel p-8 text-center text-zinc-500">
        {error ? <span className="text-red-400">エラー: {error}</span> : '対局を読み込み中...'}
      </div>
    );
  }

  // 黒残り時間表示
  const renderBlackClock = () => {
    if (!clock) return null;
    const isLow = clock.blackTimeLeft <= 10 && clock.blackTimeLeft > 0;
    const isByoyomi = !!clock.blackInByoyomi;
    return (
      <span data-testid="clock-black" className={`ml-2 px-1.5 py-0.5 rounded text-xs font-mono font-bold ${
        isLow || isByoyomi ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-zinc-800 text-zinc-300'
      }`}>
        {isByoyomi ? `秒読 ${Math.ceil(clock.blackTimeLeft)}秒 [${clock.blackByoyomiLeft}]` : formatTime(clock.blackTimeLeft)}
      </span>
    );
  };

  // 白残り時間表示
  const renderWhiteClock = () => {
    if (!clock) return null;
    const isLow = clock.whiteTimeLeft <= 10 && clock.whiteTimeLeft > 0;
    const isByoyomi = !!clock.whiteInByoyomi;
    return (
      <span data-testid="clock-white" className={`ml-2 px-1.5 py-0.5 rounded text-xs font-mono font-bold ${
        isLow || isByoyomi ? 'bg-red-500/20 text-red-400 animate-pulse' : 'bg-zinc-800 text-zinc-300'
      }`}>
        {isByoyomi ? `秒読 ${Math.ceil(clock.whiteTimeLeft)}秒 [${clock.whiteByoyomiLeft}]` : formatTime(clock.whiteTimeLeft)}
      </span>
    );
  };

  return (
    <div className="flex min-h-full flex-col gap-3">
      {/* 対局情報ヘッダー */}
      <div className="glass-panel shrink-0 px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3 sm:gap-4 overflow-x-auto">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 rounded-lg text-sm font-semibold transition-colors duration-150 shrink-0"
            >
              <X className="w-4 h-4" /> 閉じてホーム
            </button>
          )}
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-black border border-white/20" />
            <span className={currentColor === 'BLACK' ? 'font-bold text-white' : 'text-zinc-400'}>
              {resolvePlayerName(game.black_player, students)}
            </span>
            <span className="text-zinc-600 text-sm">取{blackCaptures}</span>
            {renderBlackClock()}
          </div>
          <span className="text-zinc-600">vs</span>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-white border border-white/20" />
            <span className={currentColor === 'WHITE' ? 'font-bold text-white' : 'text-zinc-400'}>
              {resolvePlayerName(game.white_player, students)}
            </span>
            <span className="text-zinc-600 text-sm">取{whiteCaptures}</span>
            {renderWhiteClock()}
          </div>
        </div>
        <div data-testid="move-count" className="text-sm text-zinc-500 flex items-center gap-3">
          <span>
            {game.status === 'playing'
              ? `${moveNumber}手目`
              : game.status === 'scoring'
                ? '整地中'
                : game.status === 'interrupted'
                  ? '中断'
                  : `終局: ${game.result ?? ''}`}
          </span>
          {!(new URLSearchParams(window.location.search).get('mode') === 'game') && (
            <button
              onClick={() => {
                const role = isTeacher ? 'TEACHER' : 'STUDENT';
                const url = `${window.location.origin}${window.location.pathname}?mode=game&gameId=${gameId}&identity=${encodeURIComponent(myIdentity)}&role=${role}`;
                window.open(url, '_blank', 'width=1000,height=800,menubar=no,toolbar=no,location=no,status=no');
              }}
              className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold border border-blue-700 rounded px-3 py-1 transition-colors duration-150"
            >
              別ウィンドウ ↗
            </button>
          )}
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="glass-panel px-4 py-3 text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center justify-between gap-4">
          <div className="flex-1">
            <span className="font-bold">接続エラーが発生しました:</span> {error}
            <p className="text-zinc-500 text-xs mt-1">※もしリロードしても消えない場合は、右側のリセットボタンをお試しください。大切な教室設定は消えません。</p>
          </div>
          <button
            onClick={async (e) => {
              const btn = e.currentTarget;
              btn.disabled = true;
              btn.innerHTML = 'リセット中...';
              
              // 1. Supabase 強制サインアウト
              try {
                const supabase = getSupabase();
                await supabase.auth.signOut();
              } catch { /* ベストエフォート: 失敗は無視 */ }

              // 2. Service Worker 強制アンインストール
              if ('serviceWorker' in navigator) {
                try {
                  const regs = await navigator.serviceWorker.getRegistrations();
                  for (const reg of regs) {
                    await reg.unregister();
                  }
                } catch { /* ベストエフォート: 失敗は無視 */ }
              }

              // 3. Cache Storage 強制クリア
              if ('caches' in window) {
                try {
                  const keys = await caches.keys();
                  for (const key of keys) {
                    await caches.delete(key);
                  }
                } catch { /* ベストエフォート: 失敗は無視 */ }
              }

              // 4. 強制リロード (サーバーから最新アセットを再取得)
              window.location.reload();
            }}
            className="flex items-center gap-1.5 shrink-0 px-3 py-1.5 text-xs bg-red-500/20 hover:bg-red-500/40 text-red-300 border border-red-500/30 rounded-lg transition-colors duration-150 font-bold"
          >
            <RefreshCw className="w-3.5 h-3.5" /> 接続・キャッシュをリセット
          </button>
        </div>
      )}

      {/* 碁盤 */}
      <div className="glass-panel flex flex-1 min-h-0 justify-center items-center p-2 sm:p-3 shadow-2xl">
        <GoBoard
          boardState={boardState}
          boardSize={game.board_size}
          className="max-w-[min(100%,calc(100dvh-9rem))]"
          maxHeight="calc(100dvh - 9rem)"
          onCellClick={
            isDrawing
              ? undefined
              : isScoring
              ? isTeacher
                ? handleCellClick
                : undefined
              : game.status === 'playing'
                ? handleCellClick
                : undefined
          }
          readOnly={
            isDrawing
              ? false
              : isScoring
              ? !isTeacher
              : game.status !== 'playing' || !isMyTurn
          }
          onCellMouseEnter={canPlay && !isDrawing ? (x, y) => setGhostPos({ x, y }) : undefined}
          onCellMouseLeave={canPlay && !isDrawing ? () => setGhostPos(null) : undefined}
          onDragStart={isDrawing ? handleDrawDragStart : undefined}
          onDragMove={isDrawing ? handleDrawDragMove : undefined}
          onDragEnd={isDrawing ? handleDrawDragEnd : undefined}
          drawings={effectiveDrawings}
          ghostPosition={canPlay && !isDrawing ? ghostPos : null}
          ghostColor={canPlay && !isDrawing ? currentColor : undefined}
          territoryMap={scoringResult?.territoryMap}
          deadStones={deadStonesSet.size > 0 ? deadStonesSet : undefined}
        />
      </div>

      {isTeacher && game.status !== 'finished' && game.status !== 'interrupted' && (
        <div className="shrink-0 flex justify-center">
          <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-2">
            <button
              onClick={() => setDrawMode(mode => mode === 'line' ? 'off' : 'line')}
              className={`p-2 rounded-lg border transition-all ${
                drawMode === 'line'
                  ? 'bg-red-500/20 border-red-500 text-red-400'
                  : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:text-white'
              }`}
              title="線を描く"
              aria-label="線を描く"
            >
              <Pen className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDrawMode(mode => mode === 'arrow' ? 'off' : 'arrow')}
              className={`p-2 rounded-lg border transition-all ${
                drawMode === 'arrow'
                  ? 'bg-red-500/20 border-red-500 text-red-400'
                  : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-400 hover:text-white'
              }`}
              title="矢印を描く"
              aria-label="矢印を描く"
            >
              <ArrowRightIcon className="w-4 h-4" />
            </button>
            {drawings.length > 0 && (
              <button
                onClick={handleClearDrawings}
                className="p-2 rounded-lg border border-red-500/30 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-all"
                title="描画を消去"
                aria-label="描画を消去"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* 整地モード */}
      {isScoring && scoringResult && (
        <div className="shrink-0 space-y-3">
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

      {/* 操作ボタン（パス・投了とも手番の対局者本人のみ） */}
      {game.status === 'playing' && isMyTurn && (
        <div className="shrink-0 flex justify-center gap-3">
          <button
            onClick={handlePassClick}
            className="secondary-button flex items-center gap-2 text-sm"
          >
            <SkipForward className="w-4 h-4" /> パス
          </button>
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
        <div data-testid="turn-indicator" className="shrink-0 text-center text-sm text-zinc-500">
          {isMyTurn ? (
            <span className="text-blue-400 font-bold">あなたの番です</span>
          ) : isParticipant ? (
            '相手の番です'
          ) : (
            `${resolvePlayerName(currentColor === 'BLACK' ? game.black_player : game.white_player, students)}の番`
          )}
        </div>
      )}

      {/* 終局結果 */}
      {(game.status === 'finished' || game.status === 'interrupted') && game.result && (
        <div className="shrink-0 text-center text-sm text-zinc-400">
          結果: <span className="text-white font-bold">{game.result}</span>
        </div>
      )}

      {/* 先生用管理者機能 */}
      {isTeacher && (
        <div className="shrink-0 flex flex-col sm:flex-row justify-center gap-3 pt-2 border-t border-white/5">
          {game.status !== 'finished' && game.status !== 'interrupted' && (
            <button
              onClick={async () => {
                if (confirm('この対局を強制終了し、生徒の「対局中」状態を解除します（打った石は残ります）。よろしいですか？')) {
                  await finishWithResult('強制終局');
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-500/20 hover:bg-amber-500/40 text-amber-300 border border-amber-500/30 rounded-lg transition-colors duration-150 font-bold"
            >
              対局を強制終了する（状態の解除）
            </button>
          )}
          <button
            onClick={async () => {
              if (confirm('この対局のすべての石を片付け、0手目（初期状態）に戻します。よろしいですか？')) {
                await resetGame();
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-red-500/20 hover:bg-red-500/40 text-red-300 border border-red-500/30 rounded-lg transition-colors duration-150 font-bold"
          >
            <RefreshCw className="w-3.5 h-3.5" /> 対局を初期状態（0手目）に戻す
          </button>
        </div>
      )}
    </div>
  );
}
