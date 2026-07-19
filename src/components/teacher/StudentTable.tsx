import type { ParticipantInfo } from '../../utils/classroomLiveKit';
import type { Student } from '../../types/classroom';
import type { GameSession, AudioPermissions } from '../../types/game';
import { resolveGrade } from '../../utils/gradeCalc';
import { anyIdentityMatchesPlayer, identityMatchesPlayer, studentIdentityCandidates } from '../../utils/identityUtils';

interface StudentTableProps {
  participants: ParticipantInfo[];
  students: Student[];
  games: GameSession[];
  audioPermissions: AudioPermissions;
  localIdentity: string;
  onToggleHear: (identity: string) => void;
  onToggleMic: (identity: string) => void;
  onSelectStudent?: (identity: string) => void;
  onOpenStudent?: (studentIdentity: string) => void;
  onOpenHistory?: (student: Student) => void;
  onStartGame?: (identity: string) => void;
  onEditStudent?: (student: Student) => void;
  onMoveStudent?: (studentId: string, direction: 'up' | 'down') => void;
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
  onOpenStudent,
  onOpenHistory,
  onStartGame,
  onEditStudent,
  onMoveStudent,
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
            <th className="px-1 py-0.5 border border-gray-400 text-center" style={{ width: 50 }}>棋譜</th>
            <th className="px-1 py-0.5 border border-gray-400 text-center" style={{ width: 40 }}>編集</th>
            <th className="px-1 py-0.5 border border-gray-400 text-center" style={{ width: 44 }}>順序</th>
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
                data-connected={row.isConnected ? 'true' : 'false'}
                data-student-id={row.student?.id || ''}
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

                {/* 対局（進行中は状態表示、対局していない接続中の生徒は新規対局開始ボタン） */}
                <td className="px-1 py-0.5 border border-gray-400 text-center">
                  {row.gameStatus === 'playing' && '●'}
                  {row.gameStatus === 'scoring' && '整'}
                  {row.gameStatus === 'finished' && '済'}
                  {row.gameStatus === 'interrupted' && '断'}
                  {!row.gameStatus && row.isConnected && row.identity && onStartGame && (
                    <button
                      className="px-1 border border-blue-700 bg-blue-600 text-white hover:bg-blue-700"
                      style={{ fontSize: 10 }}
                      title="この生徒と新規対局を開始"
                      onClick={e => {
                        e.stopPropagation();
                        onStartGame(row.identity);
                      }}
                    >
                      対局
                    </button>
                  )}
                </td>

                {/* 詳細 — 対局中の生徒のみ観戦モードへ */}
                <td className="px-1 py-0.5 border border-gray-400 text-center">
                  {row.isConnected && (
                    <button
                      className={row.gameStatus === 'playing'
                        ? "px-1 text-xs border border-gray-500 bg-gray-100 hover:bg-gray-200"
                        : "px-1 text-xs border border-gray-300 bg-gray-50 text-gray-400 cursor-not-allowed"}
                      style={{ fontSize: 10 }}
                      disabled={row.gameStatus !== 'playing'}
                      onClick={e => {
                        e.stopPropagation();
                        if (row.gameStatus === 'playing' && row.identity) onOpenStudent?.(row.identity);
                      }}
                    >
                      開く
                    </button>
                  )}
                </td>

                {/* 棋譜履歴 */}
                <td className="px-1 py-0.5 border border-gray-400 text-center">
                  {row.student && (
                    <button
                      className="px-1 text-xs border border-gray-500 bg-gray-100 hover:bg-gray-200"
                      style={{ fontSize: 10 }}
                      onClick={e => {
                        e.stopPropagation();
                        if (row.student) onOpenHistory?.(row.student);
                      }}
                    >
                      履歴
                    </button>
                  )}
                </td>

                {/* 編集（段級位などの生徒情報を講師が変更） */}
                <td className="px-1 py-0.5 border border-gray-400 text-center">
                  {row.student && onEditStudent && (
                    <button
                      className="px-1 text-xs border border-gray-500 bg-gray-100 hover:bg-gray-200"
                      style={{ fontSize: 10 }}
                      onClick={e => {
                        e.stopPropagation();
                        if (row.student) onEditStudent(row.student);
                      }}
                    >
                      編集
                    </button>
                  )}
                </td>

                {/* 順序 */}
                <td className="px-1 py-0.5 border border-gray-400 text-center">
                  {row.student && onMoveStudent && (
                    <div className="flex justify-center gap-1">
                      <button
                        className="px-1 border border-gray-500 bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-gray-100"
                        style={{ fontSize: 9, lineHeight: 1 }}
                        disabled={!row.canMoveUp}
                        onClick={e => {
                          e.stopPropagation();
                          if (row.student) onMoveStudent(row.student.id, 'up');
                        }}
                      >
                        ▲
                      </button>
                      <button
                        className="px-1 border border-gray-500 bg-gray-100 hover:bg-gray-200 disabled:opacity-30 disabled:hover:bg-gray-100"
                        style={{ fontSize: 9, lineHeight: 1 }}
                        disabled={!row.canMoveDown}
                        onClick={e => {
                          e.stopPropagation();
                          if (row.student) onMoveStudent(row.student.id, 'down');
                        }}
                      >
                        ▼
                      </button>
                    </div>
                  )}
                </td>

                {/* 生徒ID（4桁コード優先） */}
                <td className="px-1 py-0.5 border border-gray-400 text-left" style={{ color: row.isConnected ? '#0000cc' : '#666' }}>
                  {row.student?.studentCode || row.student?.id || ''}
                </td>

                {/* 姓名 */}
                <td className="px-1 py-0.5 border border-gray-400 text-left font-bold" style={{ color: row.isConnected ? '#cc0000' : '#333' }}>
                  {row.displayName}
                  {!row.isConnected && row.gameStatus === 'playing' && (
                    <span style={{ color: '#ff6600', fontSize: 10, marginLeft: 4 }}>⚠切断</span>
                  )}
                </td>

                {/* 棋力 */}
                <td className="px-1 py-0.5 border border-gray-400 text-center">
                  {row.student?.internalRating || row.student?.rank || ''}
                </td>

                {/* 種別 */}
                <td className="px-1 py-0.5 border border-gray-400 text-left" style={{ color: row.isConnected ? '#cc0000' : '#666' }}>
                  {row.student?.type || ''}
                </td>

                {/* 学年（生年月日があれば自動計算、なければ手入力） */}
                <td className="px-1 py-0.5 border border-gray-400 text-center">
                  {resolveGrade(row.student?.birthdate, row.student?.grade ?? '')}
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
  gameStatus: 'playing' | 'scoring' | 'finished' | 'interrupted' | null;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

function buildRows(
  students: Student[],
  participants: ParticipantInfo[],
  games: GameSession[],
  localIdentity: string,
): StudentRow[] {
  const rows: StudentRow[] = [];
  const matched = new Set<string>();

  // 登録されている生徒の順序で rows を作る（クラスで決められた表示順を維持）
  for (let i = 0; i < students.length; i++) {
    const s = students[i];
    const studentCandidates = studentIdentityCandidates(s);
    const p = participants.find(part => studentCandidates.some(candidate => identityMatchesPlayer(part.identity, candidate)));
    const isConnected = !!p && p.identity !== localIdentity;
    const identity = p?.identity || s.id;
    const candidates = [...studentCandidates, identity];
    const game = games.find(g =>
      anyIdentityMatchesPlayer(candidates, g.blackPlayer) ||
      anyIdentityMatchesPlayer(candidates, g.whitePlayer)
    );

    rows.push({
      identity,
      displayName: p?.name || s.name,
      isConnected,
      student: s,
      gameStatus: game?.status || null,
      canMoveUp: i > 0,
      canMoveDown: i < students.length - 1,
    });
    matched.add(s.id);
  }

  // 登録されていないが接続中の参加者（先生を除く）を末尾に追加
  for (const p of participants) {
    if (p.identity === localIdentity) continue;
    const sId = students.find(s =>
      studentIdentityCandidates(s).some(candidate => identityMatchesPlayer(p.identity, candidate)),
    )?.id;
    if (sId && matched.has(sId)) continue;

    const game = games.find(g =>
      identityMatchesPlayer(p.identity, g.blackPlayer) ||
      identityMatchesPlayer(p.identity, g.whitePlayer)
    );
    rows.push({
      identity: p.identity,
      displayName: p.name || p.identity,
      isConnected: true,
      student: null,
      gameStatus: game?.status || null,
      canMoveUp: false,
      canMoveDown: false,
    });
  }

  return rows;
}
