import GoBoard from './GoBoard';
import type { Problem } from '../types/problem';
import { useProblemSession } from '../hooks/useProblemSession';
import { useEffect, useState } from 'react';
import { Check, X, RotateCcw, Flag } from 'lucide-react';
import TsumegoReportModal from './TsumegoReportModal';

interface ProblemBoardProps {
  problem: Problem;
  onBack: () => void;
  onResult?: (result: 'correct' | 'incorrect', moveCount: number) => void;
  isTeacher?: boolean;
}

export default function ProblemBoard({
  problem,
  onBack,
  onResult,
  isTeacher,
}: ProblemBoardProps) {
  const { problemState, startProblem, makeMove, retry } = useProblemSession();
  const [showReport, setShowReport] = useState(false);

  useEffect(() => {
    startProblem(problem);
  }, [problem, startProblem]);

  useEffect(() => {
    if (problemState?.status === 'correct' || problemState?.status === 'incorrect') {
      onResult?.(problemState.status, problemState.movesMade.length);
    }
  }, [problemState?.status, problemState?.movesMade.length, onResult]);

  if (!problemState) return null;

  const handleCellClick = (x: number, y: number) => {
    if (problemState.status !== 'solving') return;
    makeMove(x, y);
  };

  const statusColor = {
    waiting: 'text-zinc-400',
    solving: 'text-blue-400',
    correct: 'text-green-400',
    incorrect: 'text-red-400',
  }[problemState.status];

  const statusIcon = {
    waiting: null,
    solving: null,
    correct: <Check className="w-5 h-5 text-green-400" />,
    incorrect: <X className="w-5 h-5 text-red-400" />,
  }[problemState.status];

  return (
    <div className="flex min-h-full flex-col gap-3">
      {/* ヘッダー */}
      <div className="glass-panel shrink-0 px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 rounded-lg text-sm font-semibold transition-colors duration-150 shrink-0"
          >
            <X className="w-4 h-4" /> 閉じてホーム
          </button>
          <span className="font-bold">{problem.title || '詰碁'}</span>
          {problem.difficulty && (
            <span className="text-xs text-zinc-500 bg-white/5 px-2 py-0.5 rounded">{problem.difficulty}</span>
          )}
          {problem.sourceId !== undefined && (
            <button
              onClick={() => setShowReport(true)}
              title="この問題のまちがいを報告"
              aria-label="この問題のまちがいを報告"
              className="text-zinc-500 hover:text-orange-400 transition-colors p-1"
            >
              <Flag className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className={`flex items-center gap-2 font-bold ${statusColor}`}>
          {statusIcon}
          {problemState.message}
        </div>
      </div>

      {showReport && problem.sourceId !== undefined && (
        <TsumegoReportModal
          problemId={problem.id}
          sourceId={problem.sourceId}
          onClose={() => setShowReport(false)}
        />
      )}

      {/* 碁盤 */}
      <div className="glass-panel flex flex-1 min-h-0 justify-center items-center p-2 sm:p-3 shadow-2xl">
        <GoBoard
          boardState={problemState.boardState}
          boardSize={problem.boardSize}
          viewRange={problem.viewRange}
          className="max-w-[min(100%,calc(100dvh-8.5rem))]"
          maxHeight="calc(100dvh - 8.5rem)"
          onCellClick={problemState.status === 'solving' ? handleCellClick : undefined}
          readOnly={problemState.status !== 'solving'}
        />
      </div>

      {/* 操作ボタン */}
      <div className="shrink-0 flex justify-center gap-3">
        {(problemState.status === 'incorrect' || problemState.status === 'correct') && (
          <button
            onClick={retry}
            className="secondary-button flex items-center gap-2 text-sm"
          >
            <RotateCcw className="w-4 h-4" /> やり直し
          </button>
        )}
      </div>

      {/* 手数 */}
      <div className="shrink-0 text-center text-sm text-zinc-600">
        {problemState.movesMade.length}手
        {isTeacher && (
          <span className="ml-4 text-zinc-700">
            {problem.correctColor === 'BLACK' ? '黒' : '白'}先
          </span>
        )}
      </div>
    </div>
  );
}
