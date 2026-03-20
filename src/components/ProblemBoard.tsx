import GoBoard from './GoBoard';
import type { Problem } from '../types/problem';
import { useProblemSession } from '../hooks/useProblemSession';
import { useEffect } from 'react';
import { Check, X, RotateCcw, ArrowLeft } from 'lucide-react';

interface ProblemBoardProps {
  problem: Problem;
  onBack: () => void;
  onResult?: (result: 'correct' | 'incorrect') => void;
  isTeacher?: boolean;
}

export default function ProblemBoard({
  problem,
  onBack,
  onResult,
  isTeacher,
}: ProblemBoardProps) {
  const { problemState, startProblem, makeMove, retry } = useProblemSession();

  useEffect(() => {
    startProblem(problem);
  }, [problem, startProblem]);

  useEffect(() => {
    if (problemState?.status === 'correct' || problemState?.status === 'incorrect') {
      onResult?.(problemState.status);
    }
  }, [problemState?.status, onResult]);

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
    <div className="space-y-4">
      {/* ヘッダー */}
      <div className="glass-panel px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-zinc-500 hover:text-white text-sm">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="font-bold">{problem.title || '詰碁'}</span>
          {problem.difficulty && (
            <span className="text-xs text-zinc-500 bg-white/5 px-2 py-0.5 rounded">{problem.difficulty}</span>
          )}
        </div>
        <div className={`flex items-center gap-2 font-bold ${statusColor}`}>
          {statusIcon}
          {problemState.message}
        </div>
      </div>

      {/* 碁盤 */}
      <div className="glass-panel p-4 flex justify-center">
        <GoBoard
          boardState={problemState.boardState}
          boardSize={problem.boardSize}
          onCellClick={problemState.status === 'solving' ? handleCellClick : undefined}
          readOnly={problemState.status !== 'solving'}
        />
      </div>

      {/* 操作ボタン */}
      <div className="flex justify-center gap-3">
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
      <div className="text-center text-sm text-zinc-600">
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
