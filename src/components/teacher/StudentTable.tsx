import type { ParticipantInfo } from '../../utils/classroomLiveKit';
import type { Student } from '../../types/classroom';
import type { GameSession, AudioPermissions } from '../../types/game';
import { findStudentByIdentity, getDisplayName } from '../../utils/identityUtils';

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
  const rows = buildRows(students, participants, games, localIdentity);

  return (
    <div className="overflow-x-auto" style={{ background: '#e8e8e0' }}>
      <table className="w-full text-xs border-collapse" style={{ fontFamily: 'MS Gothic, monospace' }}>
        <thead>
          <tr style={{ background: '#d0d0c8', borderBottom: '1px solid #999' }}>
            <th className="px-1 py-0.5 border border-gray-400 text-center" style={{ width: 32 }}>状態</th>
            <th className="px-1 py-0.5 border border-gray-400 text-center" style={{ width: 32 }}>カメラ</th>
            <th className="px-1 py-0.5 border border-gray-400 text-center" style={{ width: 40 }}>音声M</th>
            <th className="px-1 py-0.5 border border-gray-400 text-center" style={{ width: 40 }}>音声S</th>
            <th className="px-1 py-0.5 border border-gray-400 text-center" style={{ width: 32 }}>共有</th>
            <th className="px-1 py-0.5 border border-gray-400 text-center" style={{ width: 32 }}>対局</th>
            <th className="px-1 py-0.5 border border-gray-400 text-center" style={{ width: 40 }}>詳細</th>
            <th className="px-1 py-0.5 border border-gray-400 text-center" style={{ width: 32 }}>送信</th>
            <th className="px-1 py-0.5 border border-gray-400 text-left" style={{ width: 130 }}>生徒ＩＤ</th>
            <th className="px-1 py-0.5 border border-gray-400 text-left">姓名</th>
            <th className="px-1 py-0.5 border border-gray-400 text-center" style={{ width: 36 }}>棋力</th>
            <th className="px-1 py-0.5 border border-gray-400 text-left" style={{ width: 70 }}>種別</th>
            <th className="px-1 py-0.5 border border-gray-400 text-center" style={{ width: 36 }}>学年</th>
            <th className="px-1 py-0.5 border border-gray-400 text-left">所在地</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const perm = audioPermissions[row.identity] || { canHear: true, micAllowed: true, cameraAllowed: true };
            // IGC: 接続中 = 水色背景, 最初の行(アクティブ) = 黄緑
            const bgColor = row.isConnected
              ? (i === 0 ? '#90ee90' : '#b0f0f0')
              : '#e8e8e0';

            return (
              <tr
                key={row.identity || row.student?.id || `empty-${i}`}
                style={{ background: bgColor, cursor: row.isConnected ? 'pointer' : 'default' }}
                onClick={() => row.isConnected && row.identity && onSelectStudent?.(row.identity)}
              >
                {/* 状態 */}
                <td className="px-1 py-0.5 border border-gray-400 text-center">
                  {row.isConnected ? '▶' : ''}
                </td>

                {/* カメラ */}
                <td className="px-1 py-0.5 border border-gray-400 text-center">
                  {row.isConnected && (
                    <input type="checkbox" checked readOnly className="w-3 h-3" />
                  )}
                </td>

                {/* 音声M（マイク） */}
                <td className="px-1 py-0.5 border border-gray-400 text-center">
                  {row.isConnected && row.identity !== localIdentity ? (
                    <input
                      type="checkbox"
                      checked={perm.micAllowed}
                      onChange={() => onToggleMic(row.identity)}
                      onClick={e => e.stopPropagation()}
                      className="w-3 h-3"
                    />
                  ) : row.isConnected ? (
                    <input type="checkbox" checked readOnly className="w-3 h-3" />
                  ) : null}
                </td>

                {/* 音声S（スピーカー） */}
                <td className="px-1 py-0.5 border border-gray-400 text-center">
                  {row.isConnected && row.identity !== localIdentity ? (
                    <input
                      type="checkbox"
                      checked={perm.canHear}
                      onChange={() => onToggleHear(row.identity)}
                      onClick={e => e.stopPropagation()}
                      className="w-3 h-3"
                    />
                  ) : row.isConnected ? (
                    <input type="checkbox" checked readOnly className="w-3 h-3" />
                  ) : null}
                </td>

                {/* 共有 */}
                <td className="px-1 py-0.5 border border-gray-400 text-center">
                  {row.isConnected && (
                    <input type="checkbox" checked readOnly className="w-3 h-3" />
                  )}
                </td>

                {/* 対局 */}
                <td className="px-1 py-0.5 border border-gray-400 text-center">
                  {row.gameStatus === 'playing' && '●'}
                  {row.gameStatus === 'finished' && '済'}
                </td>

                {/* 詳細 */}
                <td className="px-1 py-0.5 border border-gray-400 text-center">
                  {row.isConnected && (
                    <button
                      className="px-1 text-xs border border-gray-500 bg-gray-100 hover:bg-gray-200"
                      style={{ fontSize: 10 }}
                      onClick={e => { e.stopPropagation(); }}
                    >
                      開く
                    </button>
                  )}
                </td>

                {/* 送信 */}
                <td className="px-1 py-0.5 border border-gray-400 text-center">
                </td>

                {/* 生徒ID */}
                <td className="px-1 py-0.5 border border-gray-400 text-left" style={{ color: row.isConnected ? '#0000cc' : '#666' }}>
                  {row.student?.id || ''}
                </td>

                {/* 姓名 */}
                <td className="px-1 py-0.5 border border-gray-400 text-left font-bold" style={{ color: row.isConnected ? '#cc0000' : '#333' }}>
                  {row.displayName}
                </td>

                {/* 棋力 */}
                <td className="px-1 py-0.5 border border-gray-400 text-center">
                  {row.student?.internalRating || row.student?.rank || ''}
                </td>

                {/* 種別 */}
                <td className="px-1 py-0.5 border border-gray-400 text-left" style={{ color: row.isConnected ? '#cc0000' : '#666' }}>
                  {row.student?.type || ''}
                </td>

                {/* 学年 */}
                <td className="px-1 py-0.5 border border-gray-400 text-center">
                  {row.student?.grade || ''}
                </td>

                {/* 所在地 */}
                <td className="px-1 py-0.5 border border-gray-400 text-left">
                  {row.student?.country || ''}
                </td>
              </tr>
            );
          })}
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
    if (p.identity === localIdentity) continue;
    const student = findStudentByIdentity(p.identity, students) || null;
    const game = games.find(g =>
      (g.blackPlayer === p.identity || g.whitePlayer === p.identity)
    );
    rows.push({
      identity: p.identity,
      displayName: getDisplayName(p.identity, students),
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
