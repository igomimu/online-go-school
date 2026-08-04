import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import GoBoard from './GoBoard';
import ZoomTapConfirm from './ZoomTapConfirm';
import type { Drawing } from './GoBoard';
import { Flag, SkipForward, Check, RefreshCw, X, Undo2, Pen, ArrowRight as ArrowRightIcon, Trash2, Volume2, VolumeX, Ban } from 'lucide-react';
import { calculateTerritory, formatScoringResult, formatScoringResultJa, formatGameResultMessage, formatKomiLabel, isTimeoutResult } from '../utils/scoring';
import { findGroup } from '../utils/gameLogic';
import { formatTime } from '../hooks/useGameClock';
import { useLiveGame } from '../hooks/useLiveGame';
import { useIsTouchDevice } from '../hooks/useIsTouchDevice';
import { useIsPinchZoomed } from '../hooks/useIsPinchZoomed';
import { getSupabase } from '../utils/liveGameApi';
import { resolvePlayerName } from '../utils/identityUtils';
import { ClassroomLiveKit } from '../utils/classroomLiveKit';
import { isStoneSoundEnabled, setStoneSoundEnabled, playStoneSound, playCaptureSound, unlockStoneSound, shouldPlayMoveSound } from '../utils/stoneSound';
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
    lastMove,
    blackCaptures,
    whiteCaptures,
    isMyTurn,
    isParticipant,
    myColor,
    clock,
    loading,
    error,
    submitMove,
    submitPass,
    submitResign,
    setDeadStones,
    finishWithResult,
    resetGame,
    resumeGame,
    teacherColor,
    requestUndo,
    respondUndo,
  } = live;

  const [ghostPos, setGhostPos] = useState<{ x: number; y: number } | null>(null);
  const [pendingTap, setPendingTap] = useState<{ x: number; y: number } | null>(null);
  const isTouch = useIsTouchDevice();
  const isPinchZoomed = useIsPinchZoomed();
  // GoBoard内蔵のピンチズーム(useViewBox由来)の現在倍率。ズーム済みならZoomTapConfirmを
  // 二重に出さない（useIsPinchZoomedはブラウザネイティブズームの検知、こちらはアプリ内ズーム）。
  const [boardZoom, setBoardZoom] = useState(1);
  const BOARD_ZOOM_CONFIRM_SKIP = 1.15;
  // 対局専用の別ウィンドウ（?mode=game）は碁盤表示に特化した画面なので、
  // 通常画面より余白を切り詰めて碁盤を大きく見せる。
  const isDedicatedWindow = new URLSearchParams(window.location.search).get('mode') === 'game';
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [drawMode, setDrawMode] = useState<'off' | 'line' | 'arrow'>('off');
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const drawLastCell = useRef<{ x: number; y: number } | null>(null);

  const isScoring = game?.status === 'scoring';
  const undoRequest = game?.undo_request ?? null;
  // 着手できるのは手番の対局者本人のみ。対局中の代打ちは（先生でも）一切不可。
  // 「待った」申請中は双方とも着手不可（サーバー側のsubmit_move 409ガードと二重の防御）。
  const canPlay = game?.status === 'playing' && isMyTurn && !undoRequest;
  const isUndoRequester = !!undoRequest && myColor === undoRequest.requested_color;
  const canRespondToUndo = !!undoRequest && isParticipant && !isUndoRequester;
  // 「待った」は自分の手を戻す申請なので、自分がまだ1手も打っていない間は出さない
  // （黒の初手直後に白が申請しても戻す対象がない）。
  const hasOwnMove = myColor === 'BLACK' ? moveNumber >= 1 : moveNumber >= 2;
  const canRequestUndo = game?.status === 'playing' && !undoRequest && isParticipant && hasOwnMove;
  const isDrawing = !!isTeacher && drawMode !== 'off';
  const effectiveDrawings = isTeacher ? drawings : syncedDrawings;

  // 相手の着手等で手番が失われたら、拡大確認オーバーレイを開いたままにしない。
  // effect ではなくレンダー中に整えるのが、このリポジトリでの流儀
  // （effect 内の同期 setState は eslint が error 扱い。多面打ちの盤選択も同じ書き方）。
  if (pendingTap && !canPlay) setPendingTap(null);

  // ── 着手音・石を取る音 ──────────────────────────────────────────
  const [soundOn, setSoundOn] = useState(isStoneSoundEnabled);
  // ブラウザの自動再生ポリシー対策: 最初のユーザー操作で AudioContext を起こす
  useEffect(() => {
    window.addEventListener('pointerdown', unlockStoneSound, { once: true });
    return () => window.removeEventListener('pointerdown', unlockStoneSound);
  }, []);

  const prevMoveNumberRef = useRef<number | null>(null);
  const prevCapturesRef = useRef(0);
  useEffect(() => {
    const totalCaptures = blackCaptures + whiteCaptures;
    const prevMoveNumber = prevMoveNumberRef.current;
    const prevCaptures = prevCapturesRef.current;
    prevMoveNumberRef.current = moveNumber;
    prevCapturesRef.current = totalCaptures;

    if (!shouldPlayMoveSound(prevMoveNumber, moveNumber, lastMove)) return;

    playStoneSound();
    if (totalCaptures > prevCaptures) playCaptureSound(totalCaptures - prevCaptures);
  }, [moveNumber, lastMove, blackCaptures, whiteCaptures]);

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
      if (!isMyTurn || game.undo_request) return;
      // 手番の対局者本人のみ着手できる（代打ち不可）。
      await submitMove(x, y);
      onMoveSubmitted?.();
    },
    [game, isScoring, isTeacher, boardState, isMyTurn, submitMove, setDeadStones, onMoveSubmitted],
  );

  // スマホのタップミス対策: 対局中の自分の手番のみ、1回目のタップでは確定せず
  // 拡大確認オーバーレイ(ZoomTapConfirm)を開く。整地の死石マーキングやPCでの
  // hover+クリックは従来どおり即時反映（handleCellClickへ素通し）。
  // ただしユーザーが既にピンチアウトで碁盤を拡大表示している場合は、アプリ側の
  // 自動拡大と二重にならないよう即座に着手を確定する。
  const handleBoardCellClick = useCallback(
    (x: number, y: number) => {
      const alreadyZoomed = isPinchZoomed || boardZoom > BOARD_ZOOM_CONFIRM_SKIP;
      if (isTouch && !alreadyZoomed && game?.status === 'playing' && !isScoring && isMyTurn) {
        setPendingTap({ x, y });
        return;
      }
      handleCellClick(x, y);
    },
    [isTouch, isPinchZoomed, boardZoom, game?.status, isScoring, isMyTurn, handleCellClick],
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
    // game 全体を依存に入れると、時計の書き込みなど関係のない更新でも 3 秒の
    // タイマーが張り直され、終局結果が消えないまま残る（2026-07-15 の修正が退行する）。
    // 見ているのは status と result だけなので、この2つで十分。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.status, game?.result, onBack]);

  if (loading || !game) {
    return (
      <div className="glass-panel p-8 text-center text-muted">
        {error ? <span className="text-alert-text">エラー: {error}</span> : '対局を読み込み中...'}
      </div>
    );
  }

  // 残り時間表示。講師側は時間切れ負けにならないので、秒読み回数は [∞] と出して
  // 切迫した赤表示にもしない（切れてもそのまま打ち続けられることを見た目でも示す）。
  const renderClock = (color: 'BLACK' | 'WHITE') => {
    if (!clock) return null;
    const isBlack = color === 'BLACK';
    const timeLeft = isBlack ? clock.blackTimeLeft : clock.whiteTimeLeft;
    const byoyomiLeft = isBlack ? clock.blackByoyomiLeft : clock.whiteByoyomiLeft;
    const isByoyomi = isBlack ? !!clock.blackInByoyomi : !!clock.whiteInByoyomi;
    const isTeacherSide = teacherColor === color;
    const isLow = timeLeft <= 10 && timeLeft > 0;
    const highlight = (isLow || isByoyomi) && !isTeacherSide;
    return (
      <span data-testid={isBlack ? 'clock-black' : 'clock-white'} className={`ml-2 px-1.5 py-0.5 rounded text-xs font-mono font-bold ${
        highlight ? 'bg-alert/15 text-alert-text animate-pulse' : 'bg-raised text-ink'
      }`}>
        {isByoyomi
          ? `秒読 ${Math.ceil(timeLeft)}秒 [${isTeacherSide ? '∞' : byoyomiLeft}]`
          : formatTime(timeLeft)}
      </span>
    );
  };
  const renderBlackClock = () => renderClock('BLACK');
  const renderWhiteClock = () => renderClock('WHITE');

  return (
    <div className={`flex h-full flex-col ${isDedicatedWindow ? 'gap-1.5' : 'gap-3'}`}>
      {/* 対局情報ヘッダー */}
      <div className={`glass-panel shrink-0 flex items-center justify-between gap-3 ${isDedicatedWindow ? 'px-3 py-1' : 'px-3 py-2 sm:px-4 sm:py-3'}`}>
        <div className="flex min-w-0 items-center gap-3 sm:gap-4 overflow-x-auto">
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-raised hover:bg-line border border-line text-ink rounded-lg text-sm font-semibold transition-colors duration-150 shrink-0"
            >
              <X className="w-4 h-4" /> 閉じてホーム
            </button>
          )}
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-black border border-ink/30" />
            <span className={currentColor === 'BLACK' ? 'font-bold text-ink' : 'text-muted'}>
              黒：{resolvePlayerName(game.black_player, students)}
            </span>
            <span className="text-muted/70 text-sm">取{blackCaptures}</span>
            {renderBlackClock()}
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-white border border-ink/40" />
            <span className={currentColor === 'WHITE' ? 'font-bold text-ink' : 'text-muted'}>
              白：{resolvePlayerName(game.white_player, students)}
            </span>
            <span className="text-muted/70 text-sm">取{whiteCaptures}</span>
            {renderWhiteClock()}
          </div>
          {/* 置石とコミ。整地に入るまで見えないと、対局中に形勢を数えられない */}
          {game.handicap >= 2 && (
            <span data-testid="handicap-label" className="tabular shrink-0 text-sm text-muted whitespace-nowrap">
              {game.handicap}子
            </span>
          )}
          <span data-testid="komi-label" className="tabular shrink-0 text-sm text-muted whitespace-nowrap">
            {formatKomiLabel(game.komi)}
          </span>
        </div>
        <div data-testid="move-count" className="text-sm text-muted flex items-center gap-3">
          <span>
            {game.status === 'playing'
              ? `${moveNumber}手目`
              : game.status === 'scoring'
                ? '整地中'
                : game.status === 'interrupted'
                  ? '中断'
                  : `終局: ${game.result ?? ''}`}
          </span>
          {/* 石音（着手音・石を取る音）のON/OFF。端末ごとにlocalStorageへ保存される */}
          <button
            data-testid="stone-sound-toggle"
            onClick={() => {
              const next = !soundOn;
              setStoneSoundEnabled(next);
              setSoundOn(next);
              if (next) playStoneSound(); // ONにしたら音量確認のため1回鳴らす
            }}
            title={soundOn ? '石音を消す' : '石音を鳴らす'}
            aria-pressed={soundOn}
            className={`flex items-center gap-1 rounded border px-2 py-1 text-xs font-bold transition-colors duration-150 ${
              soundOn
                ? 'bg-raised hover:bg-line border-line text-ink'
                : 'bg-ground hover:bg-raised border-line text-muted'
            }`}
          >
            {soundOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">石音</span>
          </button>
          {/* 設定を間違えて始めた対局を、その場で取り消す（講師のみ）。
              中断ではなく終了にする。中断だと生徒側に「再開」が出てしまい、
              間違えた設定のまま再開できてしまうため。 */}
          {isTeacher && (game.status === 'playing' || game.status === 'scoring') && (
            <button
              data-testid="cancel-game"
              onClick={async () => {
                if (!confirm('この対局を取り消します。棋譜は残りません。よろしいですか？')) return;
                await finishWithResult('取消');
              }}
              title="設定を間違えたときに、この対局を取り消す"
              className="flex items-center gap-1 rounded border border-alert/35 px-2 py-1 text-xs font-bold text-muted hover:bg-alert/10 hover:text-alert-text transition-colors duration-150"
            >
              <Ban className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">対局を取り消す</span>
            </button>
          )}
          {/* スマホでは別ウィンドウを開いても見づらいだけなので、タッチデバイスでは非表示にする */}
          {!isTouch && !isDedicatedWindow && (
            <button
              onClick={() => {
                const role = isTeacher ? 'TEACHER' : 'STUDENT';
                const url = `${window.location.origin}${window.location.pathname}?mode=game&gameId=${gameId}&identity=${encodeURIComponent(myIdentity)}&role=${role}`;
                window.open(url, '_blank', 'width=700,height=800,menubar=no,toolbar=no,location=no,status=no');
              }}
              className="text-xs bg-raised hover:bg-line text-ink font-bold border border-line rounded px-3 py-1 transition-colors duration-150"
            >
              別ウィンドウ ↗
            </button>
          )}
        </div>
      </div>

      {/* エラー表示 */}
      {error && (
        <div className="glass-panel px-4 py-3 text-sm text-alert-text bg-alert/10 border border-alert/25 rounded-xl flex items-center justify-between gap-4">
          <div className="flex-1">
            <span className="font-bold">接続エラーが発生しました:</span> {error}
            <p className="text-muted text-xs mt-1">※もしリロードしても消えない場合は、右側のリセットボタンをお試しください。大切な教室設定は消えません。</p>
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
            className="flex items-center gap-1.5 shrink-0 px-3 py-1.5 text-xs bg-alert/15 hover:bg-alert/30 text-alert-text border border-alert/35 rounded-lg transition-colors duration-150 font-bold"
          >
            <RefreshCw className="w-3.5 h-3.5" /> 接続・キャッシュをリセット
          </button>
        </div>
      )}

      {/* 碁盤: maxHeight="100%" で親(flex-1 min-h-0)の実際の余り高さに追従させる。
          固定のcalc(100dvh - Nrem)だと、待ったバナー等でUI要素が増えるたびに
          画面全体がoverflowしてスクロールバーが出てしまう（常に碁盤全体を映す要件）。 */}
      <div className={`glass-panel flex flex-1 min-h-0 justify-center items-center shadow-2xl overflow-hidden ${isDedicatedWindow ? 'p-0.5' : 'p-2 sm:p-3'}`}>
        <GoBoard
          boardState={boardState}
          boardSize={game.board_size}
          className="!w-auto h-full max-w-full"
          maxHeight="100%"
          onZoomChange={setBoardZoom}
          onCellClick={
            isDrawing
              ? undefined
              : isScoring
              ? isTeacher
                ? handleBoardCellClick
                : undefined
              : game.status === 'playing'
                ? handleBoardCellClick
                : undefined
          }
          readOnly={
            isDrawing
              ? false
              : isScoring
              ? !isTeacher
              : game.status !== 'playing' || !isMyTurn || !!undoRequest
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
        {pendingTap && (
          <ZoomTapConfirm
            boardState={boardState}
            boardSize={game.board_size}
            x={pendingTap.x}
            y={pendingTap.y}
            color={currentColor}
            onConfirm={(cx, cy) => {
              setPendingTap(null);
              handleCellClick(cx, cy);
            }}
            onCancel={() => setPendingTap(null)}
          />
        )}
      </div>

      {/* 描画機能は検討・解説用途。対局中は使わないため整地中のみ表示する。 */}
      {isTeacher && game.status === 'scoring' && (
        <div className="shrink-0 flex justify-center">
          <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-xl border border-line bg-ground/60 p-2">
            <button
              onClick={() => setDrawMode(mode => mode === 'line' ? 'off' : 'line')}
              className={`p-2 rounded-lg border transition-all ${
                drawMode === 'line'
                  ? 'bg-alert/15 border-alert text-alert-text'
                  : 'bg-raised border-line text-muted hover:text-ink'
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
                  ? 'bg-alert/15 border-alert text-alert-text'
                  : 'bg-raised border-line text-muted hover:text-ink'
              }`}
              title="矢印を描く"
              aria-label="矢印を描く"
            >
              <ArrowRightIcon className="w-4 h-4" />
            </button>
            {drawings.length > 0 && (
              <button
                onClick={handleClearDrawings}
                className="p-2 rounded-lg border border-alert/35 text-muted hover:text-alert-text hover:bg-alert/10 transition-all"
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
            {/* 指示文なので生成りで読ませ、榧は結果と「確定」に取っておく */}
            <div className="text-center text-sm font-bold text-ink mb-2">
              整地モード {isTeacher ? '— 死石をクリックしてマークしてください' : '— 先生が整地中です'}
            </div>
            <div className="flex justify-center gap-8 text-sm">
              <div className="text-center">
                <div className="text-muted">黒</div>
                <div className="text-ink font-bold text-lg">{scoringResult.blackTotal}</div>
                <div className="text-muted/70 text-xs">
                  地{scoringResult.blackTerritory} + 取{blackCaptures + scoringResult.deadWhiteStones}
                </div>
              </div>
              <div className="text-center">
                <div className="text-muted">白</div>
                <div className="text-ink font-bold text-lg">{scoringResult.whiteTotal}</div>
                <div className="text-muted/70 text-xs">
                  地{scoringResult.whiteTerritory} + 取{whiteCaptures + scoringResult.deadBlackStones} + コミ{game.komi}
                </div>
              </div>
              <div className="text-center">
                <div className="text-muted">結果</div>
                <div className="text-accent-text font-bold text-lg">{formatScoringResultJa(scoringResult)}</div>
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

      {/* 「待った」申請中バナー */}
      {undoRequest && (
        <div className="glass-panel px-4 py-3 flex items-center justify-between gap-4 border border-accent/30 bg-accent/10">
          <span className="text-sm text-ink">
            {isUndoRequester
              ? '「待った」を申請中です。相手の返答をお待ちください。'
              : `${resolvePlayerName(undoRequest.requested_by, students)} が「待った」を申請しています。`}
          </span>
          <div className="flex gap-2 shrink-0">
            {isUndoRequester && (
              <button onClick={() => respondUndo(false)} className="secondary-button text-xs">
                取り下げる
              </button>
            )}
            {canRespondToUndo && (
              <>
                <button onClick={() => respondUndo(true)} className="premium-button text-xs">
                  承諾する
                </button>
                <button onClick={() => respondUndo(false)} className="secondary-button text-xs">
                  拒否する
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 操作ボタン行＋ターン表示を1行にまとめてコンパクト化
          （パス・投了は手番の対局者本人のみ、「待った」は手番に関係なく対局者に表示）。 */}
      {game.status === 'playing' && (
        <div className="shrink-0 flex flex-wrap items-center justify-center gap-2">
          {isMyTurn && !undoRequest && (
            <>
              <button
                onClick={handlePassClick}
                className="secondary-button flex items-center gap-1.5 text-xs px-3 py-1.5"
              >
                <SkipForward className="w-3.5 h-3.5" /> パス
              </button>
              <button
                onClick={handleResignClick}
                className="secondary-button flex items-center gap-1.5 text-xs px-3 py-1.5 border-alert/25 hover:bg-alert/10 hover:text-alert-text"
              >
                <Flag className="w-3.5 h-3.5" /> 投了
              </button>
            </>
          )}
          {canRequestUndo && (
            <button
              onClick={() => {
                if (confirm('自分の最後の一手を取り消す「待った」を相手に申請しますか？\n（相手が既に打っていれば、その一手も一緒に戻ります）')) requestUndo();
              }}
              className="secondary-button flex items-center gap-1.5 text-xs px-3 py-1.5"
            >
              <Undo2 className="w-3.5 h-3.5" /> 待った
            </button>
          )}
          <span data-testid="turn-indicator" className="text-xs text-muted">
            {isMyTurn ? (
              <span className="text-accent-text font-bold">あなたの番です</span>
            ) : isParticipant ? (
              '相手の番です'
            ) : (
              `${resolvePlayerName(currentColor === 'BLACK' ? game.black_player : game.white_player, students)}の番`
            )}
          </span>
        </div>
      )}

      {/* 終局結果。小さな1行だと投了直後に見落とすので、はっきり読める大きさで出す
          （読み上げ「〇の中押し勝ちです」と対で、無言・無表示で閉じないようにする 2026-08-02）。 */}
      {(game.status === 'finished' || game.status === 'interrupted') && game.result && (
        <div
          data-testid="game-result-banner"
          className="shrink-0 flex flex-col items-center gap-3 rounded-xl border border-accent/40 bg-accent/10 px-4 py-4 text-center"
        >
          <span className="text-lg sm:text-2xl font-bold text-ink leading-snug">
            {formatGameResultMessage(game.result)}
          </span>
          <span className="text-xs text-muted">{moveNumber}手で終局</span>
          {onBack && (
            <button
              onClick={onBack}
              data-testid="game-result-close"
              className="px-4 py-2 bg-raised hover:bg-line border border-line text-ink rounded-lg text-sm font-bold transition-colors duration-150"
            >
              閉じてホームへ
            </button>
          )}
          {/* 回線トラブル等で不本意に切れた対局を、講師の判断でその場から再開する */}
          {isTeacher && isTimeoutResult(game.result) && (
            <button
              data-testid="resume-timeout-game"
              onClick={async () => {
                if (!confirm('時間切れで終わったこの対局を再開しますか？（切れた側の時間は戻します）')) return;
                await resumeGame();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent/15 hover:bg-accent/20 text-accent-text border border-accent/30 rounded-lg transition-colors duration-150 font-bold"
            >
              <RefreshCw className="w-3.5 h-3.5" /> 対局を再開する
            </button>
          )}
        </div>
      )}

      {/* 先生用管理者機能（テスト・開発時のみ。本番の対局画面には出さない） */}
      {isTeacher && import.meta.env.DEV && (
        <div className="shrink-0 flex flex-col sm:flex-row justify-center gap-3 pt-2 border-t border-line">
          {game.status !== 'finished' && game.status !== 'interrupted' && (
            <button
              onClick={async () => {
                if (confirm('この対局を強制終了し、生徒の「対局中」状態を解除します（打った石は残ります）。よろしいですか？')) {
                  await finishWithResult('強制終局');
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent/15 hover:bg-accent/20 text-accent-text border border-accent/30 rounded-lg transition-colors duration-150 font-bold"
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
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-alert/15 hover:bg-alert/30 text-alert-text border border-alert/35 rounded-lg transition-colors duration-150 font-bold"
          >
            <RefreshCw className="w-3.5 h-3.5" /> 対局を初期状態（0手目）に戻す
          </button>
        </div>
      )}
    </div>
  );
}
