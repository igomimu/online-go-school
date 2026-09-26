import GoBoard from './GoBoard';
import type { Problem } from '../types/problem';
import type { TsumegoRatingState, RatingUpdateResult } from '../types/tsumegoRating';
import { useProblemSession } from '../hooks/useProblemSession';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchRandomTsumegoProblem } from '../utils/tsumegoApi';
import { tsumegoRowToProblem } from '../utils/tsumegoConvert';
import { processRatingUpdate, pickRandomLevelForRank } from '../utils/tsumegoRating';
import { Check, X, RotateCcw, Flag, Heart, Timer } from 'lucide-react';
import TsumegoReportModal from './TsumegoReportModal';
import TsumegoRatingBar from './tsumego/TsumegoRatingBar';
import TsumegoRankTransitionModal from './tsumego/TsumegoRankTransitionModal';

export interface ProblemProgress {
  attempt: number;          // この問題の何回目の挑戦か
  livesLeft: number | null; // 残りライフ（null=無制限）
  problemNo: number;        // 出題から数えて何問目か
  solved: number;           // 解けた問題数
  failed: number;           // ライフが尽きた・時間切れの問題数
  timedOut: boolean;        // この結果が時間切れによるものか
}

interface ProblemBoardProps {
  problem: Problem;
  onBack: () => void;
  onResult?: (result: 'correct' | 'incorrect', moveCount: number, progress: ProblemProgress) => void;
  /** 問題を解き始めたとき（最初の1問と、自動で次へ進んだとき）。先生のモニターへ知らせる */
  onProblemStart?: (problem: Problem, progress: ProblemProgress) => void;
  isTeacher?: boolean;
  /** 格付けチャレンジモードの現在の状態 */
  ratingState?: TsumegoRatingState | null;
  /** 格付け変動時のコールバック */
  onRatingUpdate?: (result: RatingUpdateResult) => void;
}

/** 結果を見せてから次の問題へ進むまでの間 */
const NEXT_PROBLEM_DELAY_MS = 2500;

function formatRemaining(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 「5K+」も「5K」と同じレベルとして次の問題を引く */
function baseLevel(level: string | undefined): string | undefined {
  return level ? level.replace(/\+$/, '') : undefined;
}

export default function ProblemBoard({
  problem,
  onBack,
  onResult,
  onProblemStart,
  isTeacher,
  ratingState,
  onRatingUpdate,
}: ProblemBoardProps) {
  const { problemState, startProblem, makeMove, timeUp, retry } = useProblemSession();
  const [showReport, setShowReport] = useState(false);
  // いま解いている問題。ライフ付きの出題では、解けたら・ライフが尽きたら生徒ごとに次へ進む
  const [current, setCurrent] = useState<Problem>(problem);
  // 格付けチャレンジの状態
  const [currentRating, setCurrentRating] = useState<TsumegoRatingState | null>(ratingState ?? null);
  const [transitionModal, setTransitionModal] = useState<{
    event: 'promoted' | 'demoted';
    prevRankId: string;
    newRankId: string;
  } | null>(null);
  const hasRatedCurrentRef = useRef(false);

  // まちがえた回数。結果を送る effect から読むので ref も持つ（state を依存に入れると二重に送る）
  const [misses, setMisses] = useState(0);
  const missesRef = useRef(0);
  const statsRef = useRef({ problemNo: 1, solved: 0, failed: 0 });
  const seenIdsRef = useRef<Set<string>>(new Set([problem.id]));
  const [nextError, setNextError] = useState<string | null>(null);
  const [loadingNext, setLoadingNext] = useState(false);
  const lives = current.lives;
  const autoNext = problem.lives !== undefined || !!ratingState;
  // 1問ごとの制限時間。やり直しても時計は戻さない（三村さん 2026-09-19）
  const [remainingSec, setRemainingSec] = useState<number | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const timedOutRef = useRef(false);
  const problemStateRef = useRef(problemState);
  problemStateRef.current = problemState;

  // 先生が新しく出題したら最初から
  useEffect(() => {
    statsRef.current = { problemNo: 1, solved: 0, failed: 0 };
    seenIdsRef.current = new Set([problem.id]);
    setCurrent(problem);
  }, [problem]);

  useEffect(() => {
    if (ratingState !== undefined) {
      setCurrentRating(ratingState);
    }
  }, [ratingState]);

  useEffect(() => {
    missesRef.current = 0;
    setMisses(0);
    setNextError(null);
    timedOutRef.current = false;
    setTimedOut(false);
    hasRatedCurrentRef.current = false;
    startProblem(current);
    // 🔴 これが無いと、先生には次の結果が出るまで前の問題の「正解」が残り、
    // 碁盤も最初に出題した1問目のままだった（2026-09-26 三村さん）
    onProblemStart?.(current, {
      attempt: 1,
      livesLeft: current.lives ?? null,
      ...statsRef.current,
      timedOut: false,
    });
    // onProblemStart は親の再描画で作り直されるので依存に入れない（入れると同じ問題で何度も送る）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, startProblem]);

  useEffect(() => {
    const limit = current.timeLimitSec;
    if (!limit) {
      setRemainingSec(null);
      return;
    }
    const deadline = Date.now() + limit * 1000;
    setRemainingSec(limit);
    const timer = setInterval(() => {
      const left = (deadline - Date.now()) / 1000;
      const state = problemStateRef.current;
      const done = state?.status === 'correct'
        || (state?.status === 'incorrect' && lives !== undefined && missesRef.current >= lives);
      if (done) {
        clearInterval(timer);
        return;
      }
      setRemainingSec(Math.max(0, left));
      if (left > 0) return;
      clearInterval(timer);
      // 時間切れはこの問題の失敗。ライフは減らさず、結果はここで送る（effect には任せない）
      timedOutRef.current = true;
      setTimedOut(true);
      if (autoNext) statsRef.current = { ...statsRef.current, failed: statsRef.current.failed + 1 };
      
      // 格付け更新（時間切れ失敗）
      if (currentRating && !hasRatedCurrentRef.current) {
        hasRatedCurrentRef.current = true;
        const res = processRatingUpdate(currentRating, false);
        setCurrentRating(res.nextState);
        onRatingUpdate?.(res);
        if (res.event !== 'none') {
          setTransitionModal({ event: res.event, prevRankId: res.previousRankId, newRankId: res.nextState.rankId });
        }
      }

      onResult?.('incorrect', state?.movesMade.length ?? 0, {
        attempt: missesRef.current + 1,
        livesLeft: lives === undefined ? null : Math.max(0, lives - missesRef.current),
        ...statsRef.current,
        timedOut: true,
      });
      timeUp();
    }, 250);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, timeUp, currentRating, onRatingUpdate]);

  const goNext = useCallback(async () => {
    setLoadingNext(true);
    setNextError(null);
    try {
      let row = null;
      // 格付けモード時は現在の格に応じた難易度を自動選出
      const targetLevel = currentRating
        ? pickRandomLevelForRank(currentRating.rankId)
        : baseLevel(current.difficulty);

      // 同じ問題を続けて引かないよう、数回まで引き直す
      for (let i = 0; i < 5; i++) {
        const candidate = await fetchRandomTsumegoProblem({
          level: targetLevel,
          boardSize: current.boardSize,
        });
        if (!candidate) break;
        row = candidate;
        if (!seenIdsRef.current.has(candidate.id)) break;
      }
      if (!row) {
        setNextError('次の問題が見つかりませんでした');
        return;
      }
      seenIdsRef.current.add(row.id);
      statsRef.current = { ...statsRef.current, problemNo: statsRef.current.problemNo + 1 };
      setCurrent({ ...tsumegoRowToProblem(row), lives: current.lives, timeLimitSec: current.timeLimitSec });
    } catch (err) {
      setNextError(err instanceof Error ? err.message : '次の問題を取得できませんでした');
    } finally {
      setLoadingNext(false);
    }
  }, [current, currentRating]);

  useEffect(() => {
    const status = problemState?.status;
    if (status !== 'correct' && status !== 'incorrect') return;
    if (timedOutRef.current) return; // 時間切れはタイマー側で送り済み
    const attempt = missesRef.current + 1;
    if (status === 'incorrect') {
      missesRef.current = attempt;
      setMisses(attempt);
    }
    const livesLeft = lives === undefined ? null : Math.max(0, lives - missesRef.current);
    const finished = status === 'correct' || livesLeft === 0;
    if (autoNext && finished) {
      statsRef.current = status === 'correct'
        ? { ...statsRef.current, solved: statsRef.current.solved + 1 }
        : { ...statsRef.current, failed: statsRef.current.failed + 1 };
    }

    // 格付け更新（正解、またはライフ切れ失敗）
    if (currentRating && finished && !hasRatedCurrentRef.current) {
      hasRatedCurrentRef.current = true;
      const isCorrect = status === 'correct';
      const res = processRatingUpdate(currentRating, isCorrect);
      setCurrentRating(res.nextState);
      onRatingUpdate?.(res);
      if (res.event !== 'none') {
        setTransitionModal({ event: res.event, prevRankId: res.previousRankId, newRankId: res.nextState.rankId });
      }
    }

    onResult?.(status, problemState?.movesMade.length ?? 0, { attempt, livesLeft, ...statsRef.current, timedOut: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemState?.status, problemState?.movesMade.length, onResult, currentRating, onRatingUpdate]);

  const livesLeft = lives === undefined ? null : Math.max(0, lives - misses);
  const outOfLives = livesLeft === 0;
  const finished = problemState?.status === 'correct'
    || (problemState?.status === 'incorrect' && (outOfLives || timedOut));

  // 解けたら・ライフが尽きたら、結果を少し見せてから同じレベルの次の問題へ
  useEffect(() => {
    if (!autoNext || !finished) return;
    const timer = setTimeout(() => { void goNext(); }, NEXT_PROBLEM_DELAY_MS);
    return () => clearTimeout(timer);
  }, [autoNext, finished, goNext]);

  if (!problemState) return null;

  // ライフありの出題では正解・ライフ切れで次へ進む。やり直せるのはライフが残っている不正解だけ
  const canRetry = problemState.status === 'incorrect'
    ? !outOfLives && !timedOut
    : problemState.status === 'correct' && !autoNext;

  const handleCellClick = (x: number, y: number) => {
    if (problemState.status !== 'solving') return;
    makeMove(x, y);
  };

  const statusColor = {
    waiting: 'text-muted',
    solving: 'text-accent-text',
    correct: 'text-accent-text',
    incorrect: 'text-alert-text',
  }[problemState.status];

  const statusIcon = {
    waiting: null,
    solving: null,
    correct: <Check className="w-5 h-5 text-accent-text" />,
    incorrect: <X className="w-5 h-5 text-alert-text" />,
  }[problemState.status];

  return (
    <div className="flex min-h-full flex-col gap-3">
      {/* 昇格・降格モーダル */}
      {transitionModal && (
        <TsumegoRankTransitionModal
          event={transitionModal.event}
          previousRankId={transitionModal.prevRankId}
          newRankId={transitionModal.newRankId}
          onClose={() => setTransitionModal(null)}
        />
      )}

      {/* 格付けチャレンジの進捗バー */}
      {currentRating && (
        <TsumegoRatingBar state={currentRating} className="shrink-0" />
      )}

      {/* ヘッダー */}
      <div className="glass-panel shrink-0 px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-raised hover:bg-line border border-line text-ink rounded-lg text-sm font-semibold transition-colors duration-150 shrink-0"
          >
            <X className="w-4 h-4" /> 閉じてホーム
          </button>
          {autoNext && (
            <span className="text-sm text-muted" data-testid="problem-number">{statsRef.current.problemNo}問目</span>
          )}
          <span className="font-bold">{current.title || '詰碁'}</span>
          {current.difficulty && (
            <span className="text-xs text-muted bg-ink/5 px-2 py-0.5 rounded">{current.difficulty}</span>
          )}
          {current.sourceId !== undefined && (
            <button
              onClick={() => setShowReport(true)}
              title="この問題のまちがいを報告"
              aria-label="この問題のまちがいを報告"
              // 旗のアイコンだけでは気づかれなかった（2026-09-26 三村さん）。文字を付けて押せると分かる形に
              className="flex items-center gap-1 shrink-0 rounded-md border border-line bg-raised px-2 py-1 text-xs font-semibold text-muted hover:text-alert-text hover:border-alert-text/50 transition-colors duration-150"
            >
              <Flag className="w-3.5 h-3.5" />
              まちがいを報告
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {remainingSec !== null && (
            <div
              data-testid="problem-timer"
              className={`flex items-center gap-1 text-sm font-bold tabular-nums ${remainingSec <= 10 ? 'text-alert-text' : 'text-muted'}`}
            >
              <Timer className="w-4 h-4" />
              {formatRemaining(remainingSec)}
            </div>
          )}
          {lives !== undefined && livesLeft !== null && (
            <div className="flex items-center gap-0.5" aria-label={`ライフ 残り${livesLeft}`} data-testid="problem-lives">
              {Array.from({ length: lives }, (_, i) => (
                <Heart
                  key={i}
                  className={`w-4 h-4 ${i < livesLeft ? 'text-alert-text fill-current' : 'text-muted/40'}`}
                />
              ))}
            </div>
          )}
          <div className={`flex items-center gap-2 font-bold ${statusColor}`}>
            {statusIcon}
            {timedOut ? '時間切れ' : outOfLives && problemState.status === 'incorrect' ? 'ライフがなくなりました' : problemState.message}
            {autoNext && finished && (
              <span className="text-sm font-normal text-muted">
                {nextError ?? (loadingNext ? '次の問題を準備中…' : 'まもなく次の問題')}
              </span>
            )}
          </div>
        </div>
      </div>

      {showReport && current.sourceId !== undefined && (
        <TsumegoReportModal
          problemId={current.id}
          sourceId={current.sourceId}
          onClose={() => setShowReport(false)}
        />
      )}

      {/* 碁盤 */}
      <div className="glass-panel flex flex-1 min-h-0 justify-center items-center p-2 sm:p-3 shadow-2xl">
        <GoBoard
          boardState={problemState.boardState}
          boardSize={current.boardSize}
          viewRange={current.viewRange}
          className="max-w-[min(100%,calc(100dvh-8.5rem))]"
          maxHeight="calc(100dvh - 8.5rem)"
          onCellClick={problemState.status === 'solving' ? handleCellClick : undefined}
          readOnly={problemState.status !== 'solving'}
        />
      </div>

      {/* 操作ボタン */}
      <div className="shrink-0 flex justify-center gap-3">
        {autoNext && finished && nextError && (
          <button
            onClick={() => { void goNext(); }}
            className="secondary-button flex items-center gap-2 text-sm"
          >
            次の問題へ
          </button>
        )}
        {canRetry && (
          <button
            onClick={retry}
            className="secondary-button flex items-center gap-2 text-sm"
          >
            <RotateCcw className="w-4 h-4" /> やり直し
          </button>
        )}
      </div>

      {/* 手数 */}
      <div className="shrink-0 text-center text-sm text-muted/75">
        {problemState.movesMade.length}手
        {isTeacher && (
          <span className="ml-4 text-muted/60">
            {current.correctColor === 'BLACK' ? '黒' : '白'}先
          </span>
        )}
      </div>
    </div>
  );
}
