import type { ParticipantInfo } from '../../utils/classroomRtc';
import type { Student } from '../../types/classroom';
import type { Problem, ProblemResultView } from '../../types/problem';
import GoBoard from '../GoBoard';
import { identityMatchesPlayer, studentIdentityCandidates } from '../../utils/identityUtils';
import { Check, X, Clock } from 'lucide-react';

interface ProblemMonitorPanelProps {
  problem: Problem;
  students: Student[];
  participants: ParticipantInfo[];
  results: Record<string, ProblemResultView>;
  localIdentity: string;
  /** 出題先（null=全員）。出していない生徒は一覧に出さない */
  targets?: string[] | null;
  onBack: () => void;
}

interface MonitorRow {
  identity: string;
  displayName: string;
  isConnected: boolean;
  result: 'correct' | 'incorrect' | null;
  moveCount: number | null;
  view: ProblemResultView | null;
}

function buildRows(
  students: Student[],
  participants: ParticipantInfo[],
  results: Record<string, ProblemResultView>,
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
      view: r ?? null,
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
      view: r ?? null,
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
  targets = null,
  onBack,
}: ProblemMonitorPanelProps) {
  const rows = buildRows(students, participants, results, localIdentity)
    .filter(r => targets === null || targets.includes(r.identity));
  const correctCount = rows.filter(r => r.result === 'correct').length;
  const connectedCount = rows.filter(r => r.isConnected).length;

  return (
    <div className="flex min-h-full flex-col gap-3">
      {/* ヘッダー */}
      <div className="glass-panel shrink-0 px-3 py-2 sm:px-4 sm:py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-raised hover:bg-line border border-line text-ink rounded-lg text-sm font-semibold transition-colors duration-150 shrink-0"
          >
            <X className="w-4 h-4" /> 配信終了
          </button>
          <span className="font-bold">{problem.title || '詰碁'}</span>
          {problem.difficulty && (
            <span className="text-xs text-muted bg-ink/5 px-2 py-0.5 rounded">{problem.difficulty}</span>
          )}
        </div>
        <div className="text-sm text-muted">
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
            <div className="text-sm text-muted text-center py-4">生徒がいません</div>
          )}
          {rows.map(row => (
            <div
              key={row.identity}
              data-testid="problem-monitor-row"
              className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm ${
                row.isConnected ? 'bg-ink/5' : 'bg-ink/[0.03] text-muted/75'
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate">{row.displayName}</span>
                {row.view && row.view.problemNo !== undefined && (
                  <span data-testid="problem-monitor-progress" className="block text-xs text-muted">
                    {row.view.problemNo}問目・正解{row.view.solved ?? 0}・失敗{row.view.failed ?? 0}
                  </span>
                )}
              </span>
              {row.result === 'correct' && (
                <span data-testid="problem-monitor-status" className="flex items-center gap-1 text-accent-text font-bold shrink-0">
                  <Check className="w-4 h-4" /> {row.moveCount}手
                  {row.view?.attempt && row.view.attempt > 1 ? <span className="font-normal">{row.view.attempt}回目</span> : null}
                </span>
              )}
              {row.result === 'incorrect' && (
                <span data-testid="problem-monitor-status" className="flex items-center gap-1 text-alert-text font-bold shrink-0">
                  <X className="w-4 h-4" />
                  {row.view?.livesLeft === 0 ? 'ライフ切れ' : '不正解'}
                  {row.view?.livesLeft ? <span className="font-normal">残り{row.view.livesLeft}</span> : null}
                </span>
              )}
              {row.result === null && row.isConnected && (
                <span data-testid="problem-monitor-status" className="flex items-center gap-1 text-muted shrink-0">
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
