import { Video, Mic, MicOff, Volume2, VolumeX, Eye, EyeOff } from 'lucide-react';
import type { ParticipantInfo } from '../../utils/classroomRtc';
import type { Student } from '../../types/classroom';
import type { GameSession, AudioPermissions } from '../../types/game';
import { resolveGrade } from '../../utils/gradeCalc';
import { anyIdentityMatchesPlayer, identityMatchesPlayer, studentIdentityCandidates } from '../../utils/identityUtils';
import { isSharingTarget, type SharingTargets } from '../../utils/sharingTargets';
import { displayRank, DEFAULT_RANK_DISPLAY, type RankDisplay } from '../../types/classroom';
import { isTimeoutResult } from '../../utils/scoring';

/** 接続列のアイコン切替。押す操作はチェックボックスのまま（role=checkbox） */
function ConnectionToggle({
  checked,
  onChange,
  onLabel,
  offLabel,
  OnIcon,
  OffIcon,
  testId,
}: {
  checked: boolean;
  onChange: () => void;
  onLabel: string;
  offLabel: string;
  OnIcon: typeof Mic;
  OffIcon: typeof MicOff;
  testId?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      data-testid={testId}
      title={checked ? onLabel : offLabel}
      onClick={e => {
        e.stopPropagation();
        onChange();
      }}
      className={checked ? 'text-accent-text' : 'text-line'}
    >
      {checked ? <OnIcon className="h-4 w-4" /> : <OffIcon className="h-4 w-4" />}
    </button>
  );
}

interface StudentTableProps {
  participants: ParticipantInfo[];
  students: Student[];
  games: GameSession[];
  audioPermissions: AudioPermissions;
  localIdentity: string;
  onToggleHear: (identity: string) => void;
  onToggleMic: (identity: string) => void;
  /** 検討の参加者（null=全員）。対局中の生徒を外せるようにするためのもの */
  sharingTargets?: SharingTargets;
  onToggleSharing?: (identity: string) => void;
  onSelectStudent?: (identity: string) => void;
  /** この生徒を選択済みにして対局作成画面を開く */
  onCreateGame?: (identity: string) => void;
  /** 棋力の見せ方（教室ごと）。段級=「初段」/ ランク=「R12」 */
  rankDisplay?: RankDisplay;
  onOpenHistory?: (student: Student) => void;
  onInterruptGame?: (gameId: string) => void;
  onResumeGame?: (gameId: string) => void;
  onCancelGame?: (gameId: string) => void;
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
  sharingTargets = null,
  onToggleSharing,
  onSelectStudent,
  onCreateGame,
  rankDisplay = DEFAULT_RANK_DISPLAY,
  onOpenHistory,
  onInterruptGame,
  onResumeGame,
  onCancelGame,
  onEditStudent,
  onMoveStudent,
}: StudentTableProps) {
  const rows = buildRows(students, participants, games, localIdentity);

  return (
    <div className="overflow-x-auto" style={{ background: 'var(--color-surface)' }}>
      <table className="w-full text-[13px] border-collapse">
        <thead>
          <tr className="text-[11px] tracking-wide text-muted whitespace-nowrap" style={{ background: 'var(--color-raised)', borderBottom: '1px solid var(--color-line)' }}>
            <th className="px-2 py-1.5 border-b border-line text-center font-medium" style={{ width: 46 }}>状態</th>
            <th className="px-2 py-1.5 border-b border-line text-center font-medium" style={{ width: 92 }}>接続</th>
            <th className="px-2 py-1.5 border-b border-line text-center font-medium" style={{ width: 58 }}>検討</th>
            <th className="px-2 py-1.5 border-b border-line text-center font-medium" style={{ width: 144 }}>対局</th>
            <th className="px-2 py-1.5 border-b border-line text-center font-medium" style={{ width: 56 }}>棋譜</th>
            <th className="px-2 py-1.5 border-b border-line text-center font-medium" style={{ width: 50 }}>編集</th>
            <th className="px-2 py-1.5 border-b border-line text-center font-medium" style={{ width: 52 }}>順序</th>
            <th className="px-2 py-1.5 border-b border-line text-left font-medium" style={{ width: 130 }}>生徒ＩＤ</th>
            <th className="px-2 py-1.5 border-b border-line text-left font-medium">姓名</th>
            <th className="px-2 py-1.5 border-b border-line text-center font-medium" style={{ width: 46 }}>棋力</th>
            <th className="px-2 py-1.5 border-b border-line text-left font-medium" style={{ width: 74 }}>種別</th>
            <th className="px-2 py-1.5 border-b border-line text-center font-medium" style={{ width: 46 }}>学年</th>
            <th className="px-2 py-1.5 border-b border-line text-left font-medium">所在地</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const perm = audioPermissions[row.identity] || { canHear: true, micAllowed: true, cameraAllowed: true };
            const canInterrupt = row.game?.status === 'playing' || row.game?.status === 'scoring';
            const canResume = row.game?.status === 'interrupted'
              || (row.game?.status === 'finished' && isTimeoutResult(row.game.result));
            const canCancel = row.game?.status === 'playing'
              || row.game?.status === 'scoring'
              || row.game?.status === 'interrupted';
            const canCreate = row.isConnected && !canInterrupt;
            // 接続中は面を一段持ち上げ、先頭（アクティブ）行だけ榧を薄く敷く
            const bgColor = row.isConnected
              ? (i === 0 ? 'color-mix(in oklab, var(--color-accent) 16%, var(--color-surface))' : 'var(--color-raised)')
              : 'var(--color-surface)';

            return (
              <tr
                key={row.identity || row.student?.id || `empty-${i}`}
                data-connected={row.isConnected ? 'true' : 'false'}
                data-student-id={row.student?.id || ''}
                style={{ background: bgColor, cursor: row.isConnected ? 'pointer' : 'default' }}
                onClick={() => row.isConnected && row.identity && onSelectStudent?.(row.identity)}
              >
                {/* 状態。色相ではなく明度で示す（ヘッダーの接続ドットと同じ流儀） */}
                <td className="px-2 py-1.5 border-b border-line text-center font-medium">
                  <span
                    aria-label={row.isConnected ? '接続中' : '未接続'}
                    title={row.isConnected ? '接続中' : '未接続'}
                    className={`inline-block h-2.5 w-2.5 rounded-full ${
                      row.isConnected ? 'bg-ink' : 'bg-line'
                    }`}
                  />
                </td>

                {/* 接続（カメラ・マイク・スピーカー）。
                    以前は4列に分かれ、見出しの「音声M/音声S」が何を指すか伝わらなかった。
                    アイコンにしても押す操作は変えない（role=checkbox のまま）。 */}
                <td className="px-2 py-1.5 border-b border-line text-center font-medium">
                  {row.isConnected && (
                    <div className="flex items-center justify-center gap-1.5">
                      {/* カメラは状態表示のみ（先生からは切り替えられない） */}
                      <span title="カメラ" className="text-ink">
                        <Video className="h-4 w-4" />
                      </span>
                      {row.identity !== localIdentity ? (
                        <>
                          <ConnectionToggle
                            testId={`mic-${row.identity}`}
                            checked={perm.canHear}
                            onChange={() => onToggleHear(row.identity)}
                            onLabel="こちらのマイク音声が届いています（押すと止める）"
                            offLabel="こちらのマイク音声が届いていません（押すと届ける）"
                            OnIcon={Mic}
                            OffIcon={MicOff}
                          />
                          <ConnectionToggle
                            testId={`hear-${row.identity}`}
                            checked={perm.micAllowed}
                            onChange={() => onToggleMic(row.identity)}
                            onLabel="この生徒の声が聞こえます（押すと止める）"
                            offLabel="この生徒の声が聞こえません（押すと聞く）"
                            OnIcon={Volume2}
                            OffIcon={VolumeX}
                          />
                        </>
                      ) : (
                        <>
                          <span title="マイク" className="text-ink"><Mic className="h-4 w-4" /></span>
                          <span title="スピーカー" className="text-ink"><Volume2 className="h-4 w-4" /></span>
                        </>
                      )}
                    </div>
                  )}
                </td>

                {/* 検討の対象。開始前・開始後とも同じオン/オフを使う。 */}
                <td className="px-2 py-1.5 border-b border-line text-center font-medium">
                  {row.isConnected && row.identity !== localIdentity && onToggleSharing && (
                    <ConnectionToggle
                      testId={`share-${row.identity}`}
                      checked={isSharingTarget(sharingTargets, row.identity)}
                      onChange={() => onToggleSharing(row.identity)}
                      onLabel="検討オン（押すと対象外）"
                      offLabel="検討オフ（押すと対象に戻す）"
                      OnIcon={Eye}
                      OffIcon={EyeOff}
                    />
                  )}
                </td>

                {/* 対局の作成・状態変更。作成は押した生徒を黒番に選択した状態で開く。 */}
                <td className="px-2 py-1.5 border-b border-line text-center font-medium">
                  <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                    {canCreate && onCreateGame && (
                      <button
                        type="button"
                        data-testid={`create-game-${row.student?.id || row.identity}`}
                        className="rounded border border-accent/50 bg-accent px-2 py-0.5 text-accent-ink hover:bg-accent/85"
                        style={{ fontSize: 10.5, fontWeight: 700 }}
                        onClick={e => {
                          e.stopPropagation();
                          onCreateGame(row.identity);
                        }}
                      >
                        新規
                      </button>
                    )}
                    {canInterrupt && row.game && onInterruptGame && (
                      <button
                        type="button"
                        data-testid={`interrupt-game-${row.student?.id || row.identity}`}
                        className="rounded border border-alert/60 bg-surface px-2 py-0.5 text-alert-text hover:bg-alert/10"
                        style={{ fontSize: 10.5, fontWeight: 700 }}
                        onClick={e => {
                          e.stopPropagation();
                          onInterruptGame(row.game!.id);
                        }}
                      >
                        中断
                      </button>
                    )}
                    {canResume && row.game && onResumeGame && (
                      <button
                        type="button"
                        data-testid={`resume-game-${row.student?.id || row.identity}`}
                        className="rounded border border-accent/50 bg-accent px-2 py-0.5 text-accent-ink hover:bg-accent/85"
                        style={{ fontSize: 10.5, fontWeight: 700 }}
                        onClick={e => {
                          e.stopPropagation();
                          if (
                            row.game?.status === 'finished'
                            && !confirm('時間切れで終わったこの対局を再開しますか？（切れた側の時間は戻します）')
                          ) return;
                          onResumeGame(row.game!.id);
                        }}
                      >
                        再開
                      </button>
                    )}
                    {canCancel && row.game && onCancelGame && (
                      <button
                        type="button"
                        data-testid={`cancel-game-${row.student?.id || row.identity}`}
                        title="この対局を履歴に残さず取り消す"
                        className="rounded border border-line bg-surface px-2 py-0.5 text-muted hover:border-alert/60 hover:bg-alert/10 hover:text-alert-text"
                        style={{ fontSize: 10.5, fontWeight: 700 }}
                        onClick={e => {
                          e.stopPropagation();
                          onCancelGame(row.game!.id);
                        }}
                      >
                        取消
                      </button>
                    )}
                  </div>
                </td>

                {/* 棋譜履歴 */}
                <td className="px-2 py-1.5 border-b border-line text-center font-medium">
                  {row.student && (
                    <button
                      className="px-1 text-xs border border-line bg-raised text-ink hover:bg-line"
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
                <td className="px-2 py-1.5 border-b border-line text-center font-medium">
                  {row.student && onEditStudent && (
                    <button
                      className="px-1 text-xs border border-line bg-raised text-ink hover:bg-line"
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
                <td className="px-2 py-1.5 border-b border-line text-center font-medium">
                  {row.student && onMoveStudent && (
                    <div className="flex justify-center gap-1">
                      <button
                        className="px-1 border border-line bg-raised text-ink hover:bg-line disabled:opacity-30"
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
                        className="px-1 border border-line bg-raised text-ink hover:bg-line disabled:opacity-30"
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
                <td className="px-2 py-1.5 border-b border-line text-left font-medium" style={{ color: row.isConnected ? 'var(--color-accent)' : 'var(--color-muted)' }}>
                  {row.student?.studentCode || row.student?.id || ''}
                </td>

                {/* 姓名 */}
                <td className="px-1 py-0.5 border border-line text-left font-bold" style={{ color: row.isConnected ? 'var(--color-alert-text)' : 'var(--color-ink)' }}>
                  {row.displayName}
                  {!row.isConnected && row.gameStatus === 'playing' && (
                    <span style={{ color: 'var(--color-alert-text)', fontSize: 10, marginLeft: 4 }}>⚠切断</span>
                  )}
                </td>

                {/* 棋力 */}
                <td data-testid="student-rank-cell" className="px-2 py-1.5 border-b border-line text-center font-medium">
                  {row.student ? displayRank(row.student, rankDisplay) : ''}
                </td>

                {/* 種別 */}
                <td className="px-2 py-1.5 border-b border-line text-left font-medium" style={{ color: row.isConnected ? 'var(--color-alert-text)' : 'var(--color-muted)' }}>
                  {row.student?.type || ''}
                </td>

                {/* 学年（生年月日があれば自動計算、なければ手入力） */}
                <td className="px-2 py-1.5 border-b border-line text-center font-medium">
                  {resolveGrade(row.student?.birthdate, row.student?.grade ?? '')}
                </td>

                {/* 所在地 */}
                <td className="px-2 py-1.5 border-b border-line text-left font-medium">
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
  game: GameSession | null;
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
    // 中断局や時間切れ局が一覧に残っていても、現在進行中の対局を最優先する。
    const matchesCandidates = (g: GameSession) =>
      anyIdentityMatchesPlayer(candidates, g.blackPlayer) ||
      anyIdentityMatchesPlayer(candidates, g.whitePlayer);
    const game = games.find(g => matchesCandidates(g) && (g.status === 'playing' || g.status === 'scoring'))
      ?? games.find(g => matchesCandidates(g) && g.status === 'interrupted')
      ?? games.find(matchesCandidates);

    rows.push({
      identity,
      displayName: p?.name || s.name,
      isConnected,
      student: s,
      game: game ?? null,
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

    const matchesParticipant = (g: GameSession) =>
      identityMatchesPlayer(p.identity, g.blackPlayer) ||
      identityMatchesPlayer(p.identity, g.whitePlayer);
    const game = games.find(g => matchesParticipant(g) && (g.status === 'playing' || g.status === 'scoring'))
      ?? games.find(g => matchesParticipant(g) && g.status === 'interrupted')
      ?? games.find(matchesParticipant);
    rows.push({
      identity: p.identity,
      displayName: p.name || p.identity,
      isConnected: true,
      student: null,
      game: game ?? null,
      gameStatus: game?.status || null,
      canMoveUp: false,
      canMoveDown: false,
    });
  }

  return rows;
}
