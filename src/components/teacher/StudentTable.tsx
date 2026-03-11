import { Mic, MicOff, Volume2, VolumeX, Wifi, WifiOff, Gamepad2 } from 'lucide-react';
import type { ParticipantInfo } from '../../utils/classroomLiveKit';
import type { Student } from '../../types/classroom';
import type { GameSession, AudioPermissions } from '../../types/game';

interface StudentTableProps {
  participants: ParticipantInfo[];
  students: Student[];
  games: GameSession[];
  audioPermissions: AudioPermissions;
  localIdentity: string;
  onToggleHear: (identity: string) => void;
  onToggleMic: (identity: string) => void;
  onSelectStudent?: (identity: string) => void;
}

export default function StudentTable({
  participants,
  students,
  games,
  audioPermissions,
  localIdentity,
  onToggleHear,
  onToggleMic,
  onSelectStudent,
}: StudentTableProps) {
  // 登録済み生徒 + LiveKit参加者をマッチング
  const rows = buildRows(students, participants, games, localIdentity);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-white/10 text-left text-xs text-zinc-400">
            <th className="px-2 py-1.5 w-8">状態</th>
            <th className="px-2 py-1.5 w-8">音M</th>
            <th className="px-2 py-1.5 w-8">音S</th>
            <th className="px-2 py-1.5 w-8">対局</th>
            <th className="px-2 py-1.5">姓名</th>
            <th className="px-2 py-1.5 w-12">棋力</th>
            <th className="px-2 py-1.5 w-14 hidden md:table-cell">種別</th>
            <th className="px-2 py-1.5 w-10 hidden md:table-cell">学年</th>
            <th className="px-2 py-1.5 hidden lg:table-cell">所在地</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const perm = audioPermissions[row.identity] || { canHear: true, micAllowed: true, cameraAllowed: true };
            return (
              <tr
                key={row.identity || row.student?.id || Math.random()}
                className={`border-b border-white/5 transition-colors ${
                  row.isConnected
                    ? 'bg-indigo-500/5 hover:bg-indigo-500/10'
                    : 'text-zinc-600'
                }`}
                onClick={() => row.identity && onSelectStudent?.(row.identity)}
              >
                {/* 接続状態 */}
                <td className="px-2 py-1.5">
                  {row.isConnected
                    ? <Wifi className="w-3.5 h-3.5 text-green-400" />
                    : <WifiOff className="w-3.5 h-3.5 text-zinc-600" />
                  }
                </td>

                {/* マイク制御 */}
                <td className="px-2 py-1.5">
                  {row.isConnected && row.identity !== localIdentity && (
                    <button
                      onClick={e => { e.stopPropagation(); onToggleMic(row.identity); }}
                      className="hover:bg-white/10 rounded p-0.5"
                      title={perm.micAllowed ? 'マイク許可中' : 'マイク禁止中'}
                    >
                      {perm.micAllowed
                        ? <Mic className="w-3.5 h-3.5 text-blue-400" />
                        : <MicOff className="w-3.5 h-3.5 text-red-400" />
                      }
                    </button>
                  )}
                </td>

                {/* スピーカー制御 */}
                <td className="px-2 py-1.5">
                  {row.isConnected && row.identity !== localIdentity && (
                    <button
                      onClick={e => { e.stopPropagation(); onToggleHear(row.identity); }}
                      className="hover:bg-white/10 rounded p-0.5"
                      title={perm.canHear ? '音声ON' : '音声OFF'}
                    >
                      {perm.canHear
                        ? <Volume2 className="w-3.5 h-3.5 text-blue-400" />
                        : <VolumeX className="w-3.5 h-3.5 text-red-400" />
                      }
                    </button>
                  )}
                </td>

                {/* 対局状態 */}
                <td className="px-2 py-1.5">
                  {row.gameStatus === 'playing' && (
                    <Gamepad2 className="w-3.5 h-3.5 text-green-400" />
                  )}
                  {row.gameStatus === 'finished' && (
                    <span className="text-xs text-zinc-500">済</span>
                  )}
                </td>

                {/* 姓名 */}
                <td className="px-2 py-1.5 font-medium">
                  {row.displayName}
                  {row.identity === localIdentity && (
                    <span className="text-zinc-500 text-xs ml-1">(自分)</span>
                  )}
                </td>

                {/* 棋力 */}
                <td className="px-2 py-1.5">
                  {row.student?.rank && (
                    <span className="px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 text-xs font-mono">
                      {row.student.rank}
                    </span>
                  )}
                  {row.student?.internalRating && (
                    <span className="text-zinc-500 text-xs ml-0.5">{row.student.internalRating}</span>
                  )}
                </td>

                {/* 種別 */}
                <td className="px-2 py-1.5 text-xs text-zinc-400 hidden md:table-cell">
                  {row.student?.type || ''}
                </td>

                {/* 学年 */}
                <td className="px-2 py-1.5 text-xs text-zinc-400 hidden md:table-cell">
                  {row.student?.grade || ''}
                </td>

                {/* 所在地 */}
                <td className="px-2 py-1.5 text-xs text-zinc-400 hidden lg:table-cell">
                  {row.student?.country || ''}
                </td>
              </tr>
            );
          })}

          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="px-4 py-6 text-center text-zinc-500">
                生徒が接続していません
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// --- ヘルパー ---

interface StudentRow {
  identity: string;
  displayName: string;
  isConnected: boolean;
  student: Student | null;
  gameStatus: 'playing' | 'finished' | null;
}

function buildRows(
  students: Student[],
  participants: ParticipantInfo[],
  games: GameSession[],
  localIdentity: string,
): StudentRow[] {
  const rows: StudentRow[] = [];
  const matched = new Set<string>();

  // 接続中の参加者を先に（先生以外）
  for (const p of participants) {
    if (p.identity === localIdentity) continue; // 先生自身は除外
    const student = students.find(s => s.name === p.identity) || null;
    const game = games.find(g =>
      (g.blackPlayer === p.identity || g.whitePlayer === p.identity)
    );
    rows.push({
      identity: p.identity,
      displayName: p.identity,
      isConnected: true,
      student,
      gameStatus: game?.status || null,
    });
    if (student) matched.add(student.id);
  }

  // 未接続の登録済み生徒
  for (const s of students) {
    if (matched.has(s.id)) continue;
    rows.push({
      identity: s.name,
      displayName: s.name,
      isConnected: false,
      student: s,
      gameStatus: null,
    });
  }

  return rows;
}
