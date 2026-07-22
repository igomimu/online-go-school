import type { ParticipantInfo } from '../../utils/classroomLiveKit';
import type { Student } from '../../types/classroom';
import type { Problem } from '../../types/problem';
import GoBoard from '../GoBoard';
import { identityMatchesPlayer, studentIdentityCandidates } from '../../utils/identityUtils';
import { Check, X, Clock } from 'lucide-react';

interface ProblemMonitorPanelProps {
  problem: Problem;
  students: Student[];
  participants: ParticipantInfo[];
  results: Record<string, { result: 'correct' | 'incorrect'; moveCount: number }>;
  localIdentity: string;
  onBack: () => void;
}

interface MonitorRow {
  identity: string;
  displayName: string;
  isConnected: boolean;
  result: 'correct' | 'incorrect' | null;
  moveCount: number | null;
}

function buildRows(
  students: Student[],
  participants: ParticipantInfo[],
  results: Record<string, { result: 'correct' | 'incorrect'; moveCount: number }>,
  localIdentity: string,
): MonitorRow[] {
  const rows: MonitorRow[] = [];
  const matched = new Set<string>();

  // 登録生徒を軸に、接続中participants・受信済み解答結果をマージする（StudentTable.tsxのbuildRowsと同じ骨格）
  for (const s of students) {
    const candidates = studentIdentityCandidates(s);
    const p = participants.find(part => candidates.some(c => identityMatchesPlayer(part.identity, c)));
    const isConnected = !!p && p.identity !== localIdentity;
    const identity = p?.identity || s.id;
    const r = results[identity];
    rows.push({
      identity,
      displayName: p?.name || s.name,
      isConnected,
      result: r?.result ?? null,
      moveCount: r?.moveCount ?? null,
    });
    matched.add(s.id);
  }

  // 登録されていないが接続中の参加者（先生を除く）を末尾に追加
  for (const p of participants) {
    if (p.identity === localIdentity) continue;
    const sId = students.find(s => studentIdentityCandidates(s).some(c => identityMatchesPlayer(p.identity, c)))?.id;
    if (sId && matched.has(sId)) continue;
    const r = results[p.identity];
    rows.push({
      identity: p.identity,
      displayName: p.name || p.identity,
      isConnected: true,
      result: r?.result ?? null,
      moveCount: r?.moveCount ?? null,
    });
  }

  return rows;
}

/**
 * 先生用の詰碁モニター画面。先生は生徒と一緒に解くのではなく、
 * 配信した問題(読み取り専用プレビュー)と、生徒ごとの解答状況(挑戦中/正解/不正解)を見る。
 */
export default function ProblemMonitorPanel({
  problem,
  students,
  participants,
  results,
  localIdentity,
  onBack,
}: ProblemMonitorPanelProps) {
  const rows = buildRows(students, participants, results, localIdentity);
  const correctCount = rows.filter(r => r.result === 'correct').length;
  const connectedCount = rows.filter(r => r.isConnected).length;

  return (
    <div className="flex min-h-full flex-col gap-3">
      {/* ヘッダー */}
      <div className="glass-panel shrink-0 px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 rounded-lg text-sm font-semibold transition-colors duration-150 shrink-0"
          >
            <X className="w-4 h-4" /> 配信終了
          </button>
          <span className="font-bold">{problem.title || '詰碁'}</span>
          {problem.difficulty && (
            <span className="text-xs text-zinc-500 bg-white/5 px-2 py-0.5 rounded">{problem.difficulty}</span>
          )}
        </div>
        <div className="text-sm text-zinc-400">
          正解 {correctCount}/{connectedCount}名
        </div>
      </div>

      <div className="flex flex-1 min-h-0 gap-3">
        {/* 碁盤プレビュー（初期配置のみ、解答手順は見せない） */}
        <div className="glass-panel flex-1 flex items-center justify-center p-2 sm:p-3 shadow-2xl">
          <GoBoard
            boardState={problem.initialBoard}
            boardSize={problem.boardSize}
            viewRange={problem.viewRange}
            maxHeight="calc(100dvh - 10rem)"
            readOnly
          />
        </div>

        {/* 生徒一覧: 解答状況 */}
        <div className="glass-panel w-72 shrink-0 overflow-y-auto p-2 space-y-1">
          {rows.length === 0 && (
            <div className="text-sm text-zinc-500 text-center py-4">生徒がいません</div>
          )}
          {rows.map(row => (
            <div
              key={row.identity}
              data-testid="problem-monitor-row"
              className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm ${
                row.isConnected ? 'bg-white/5' : 'bg-white/[0.02] text-zinc-600'
              }`}
            >
              <span className="truncate">{row.displayName}</span>
              {row.result === 'correct' && (
                <span data-testid="problem-monitor-status" className="flex items-center gap-1 text-green-400 font-bold shrink-0">
                  <Check className="w-4 h-4" /> {row.moveCount}手
                </span>
              )}
              {row.result === 'incorrect' && (
                <span data-testid="problem-monitor-status" className="flex items-center gap-1 text-red-400 font-bold shrink-0">
                  <X className="w-4 h-4" /> 不正解
                </span>
              )}
              {row.result === null && row.isConnected && (
                <span data-testid="problem-monitor-status" className="flex items-center gap-1 text-zinc-400 shrink-0">
                  <Clock className="w-4 h-4" /> 挑戦中
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
