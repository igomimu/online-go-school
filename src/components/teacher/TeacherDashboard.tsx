import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import type { GameSession, AudioPermissions, SavedGame } from '../../types/game';
import type { ParticipantInfo } from '../../utils/classroomLiveKit';
import type { Student, Classroom } from '../../types/classroom';
import type { ChatMessage } from '../../types/chat';
import { identityMatchesPlayer, parseIdentity, resolvePlayerName, stripSid, studentIdentityCandidates } from '../../utils/identityUtils';
import { fetchActiveLiveGamesForPlayers, finishGame, getSupabase, liveRowToSession, type LiveGameRow } from '../../utils/liveGameApi';
import { loadSavedGamesForStudent } from '../../utils/savedGames';
import { isTimeoutResult } from '../../utils/scoring';

import StudentTable from './StudentTable';
import BoardThumbnailGrid from './BoardThumbnailGrid';
import ChatPanel from './ChatPanel';
import MediaDeviceSettings from '../MediaDeviceSettings';
import VerticalResizer from './VerticalResizer';
import { useStoredHeight } from './useStoredHeight';
import type { ClassroomLiveKit } from '../../utils/classroomLiveKit';
import TeacherToolbar from './TeacherToolbar';
import VideoTiles from '../VideoTiles';
import ClassroomSettingsDialog from './ClassroomSettingsDialog';
import StudentLinkGenerator from './StudentLinkGenerator';
import AutoPairingDialog from './AutoPairingDialog';
import GameObserverPanel from './GameObserverPanel';
import StudentEditDialog from './StudentEditDialog';
import TsumegoPickerDialog from './TsumegoPickerDialog';
import { upsertClassroom } from '../../utils/classroomStore';
import { applyLiveBoardSnapshotsToSessions, useLiveBoards } from '../../hooks/useLiveBoards';

interface TeacherDashboardProps {
  participants: ParticipantInfo[];
  localIdentity: string;
  students: Student[];
  classrooms: Classroom[];
  selectedClassroomId: string | null;
  onSelectClassroom: (id: string | null) => void;
  games: GameSession[];
  liveGames?: LiveGameRow[];
  audioPermissions: AudioPermissions;
  onToggleHear: (identity: string) => void;
  onToggleMic: (identity: string) => void;
  chatMessages: ChatMessage[];
  onChatSend: (text: string, target: 'all' | string) => void;
  /** 使用マイク・カメラの切り替えに使う */
  classroom?: ClassroomLiveKit | null;
  videoElements: Map<string, HTMLVideoElement>;
  studentJoinInfo: string;
  onCreateGame: () => void;
  onStartGameWithStudent?: (identity: string) => void;
  onStartLecture: () => void;
  onLoadSgf: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDisconnect: () => void;
  onReconnect: () => void;
  isReconnecting: boolean;
  onOpenStudentManager: () => void;
  onReloadData: () => void | Promise<void>;
  onCreateGames: (pairs: { blackPlayer: string; whitePlayer: string; boardSize: number; handicap: number; komi: number; clock?: import('../../types/game').GameClock }[]) => void;
  onProblemAssign?: (problem: import('../../types/problem').Problem) => void;
  onClearAudioM?: () => void;
  onClearAudioS?: () => void;
  onClearSharing?: () => void;
  onSelectSavedGame?: (game: SavedGame) => void;
  onResumeGame?: (gameId: string) => void;
  /** 講師専用の対局別ウィンドウを開く/前面化する（対局は常にこの別ウィンドウで行う） */
  onOpenTeacherGameWindow: () => void;
}

export default function TeacherDashboard({
  participants,
  localIdentity,
  students,
  classrooms,
  selectedClassroomId,
  onSelectClassroom,
  games,
  liveGames = [],
  audioPermissions,
  onToggleHear,
  onToggleMic,
  chatMessages,
  onChatSend,
  classroom,
  videoElements,
  studentJoinInfo,
  onCreateGame,
  onStartGameWithStudent,
  onStartLecture,
  onLoadSgf,
  onDisconnect,
  onReconnect,
  isReconnecting,
  onOpenStudentManager,
  onReloadData,
  onCreateGames,
  onProblemAssign,
  onClearAudioM,
  onClearAudioS,
  onClearSharing,
  onSelectSavedGame,
  onResumeGame,
  onOpenTeacherGameWindow,
}: TeacherDashboardProps) {
  const [editingClassroom, setEditingClassroom] = useState<Classroom | null>(null);
  const [showStudentLinks, setShowStudentLinks] = useState(false);
  const [showAutoPairing, setShowAutoPairing] = useState(false);
  const [observingGameId, setObservingGameId] = useState<string | null>(null);
  const [editingStudentInfo, setEditingStudentInfo] = useState<Student | null>(null);
  const [orphanLiveGames, setOrphanLiveGames] = useState<LiveGameRow[]>([]);
  const [orphanGamesError, setOrphanGamesError] = useState<string | null>(null);
  const [clearingGameId, setClearingGameId] = useState<string | null>(null);

  // 棋譜履歴表示用のステート
  const [historyStudent, setHistoryStudent] = useState<Student | null>(null);
  const [historyGames, setHistoryGames] = useState<SavedGame[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const handleOpenHistory = useCallback(async (student: Student) => {
    setHistoryStudent(student);
    setLoadingHistory(true);
    try {
      const list = await loadSavedGamesForStudent(student.name, student.id);
      setHistoryGames(list);
    } catch (err) {
      console.error('Failed to load history:', err);
      setHistoryGames([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  // 接続中参加者のUUIDをSupabaseで解決してstudentsを補完する
  const [resolvedStudents, setResolvedStudents] = useState<Student[]>([]);
  useEffect(() => {
    const uuids = participants
      .map(p => parseIdentity(p.identity))
      .filter((parsed): parsed is { type: 'student'; studentId: string } => parsed.type === 'student')
      .map(parsed => parsed.studentId)
      .filter(uuid => !students.find(s => s.id === uuid) && !resolvedStudents.find(s => s.id === uuid));
    if (uuids.length === 0) return;
    getSupabase().from('students').select('id,name,rank,grade,address,student_type,student_code').in('id', uuids).then(({ data }) => {
      if (data && data.length > 0) {
        setResolvedStudents(prev => [
          ...prev.filter(s => !data.find(d => d.id === s.id)),
          ...data.map(s => ({ id: s.id, name: s.name, rank: s.rank || '', internalRating: '', type: s.student_type || '', grade: s.grade || '', country: s.address || '', studentCode: s.student_code || '' })),
        ]);
      }
    });
  }, [participants, students, resolvedStudents]);
  const allStudents = useMemo(
    () => [...students, ...resolvedStudents.filter(r => !students.find(s => s.id === r.id))],
    [students, resolvedStudents],
  );

  // 詰碁データベース選択ダイアログ
  const [showTsumegoPicker, setShowTsumegoPicker] = useState(false);

  // 教室が未選択で教室データがあれば最初の教室を自動選択
  useEffect(() => {
    if (!selectedClassroomId && classrooms.length > 0) {
      onSelectClassroom(classrooms[0].id);
    }
  }, [selectedClassroomId, classrooms, onSelectClassroom]);

  // 教室フィルタリング
  const selectedClassroom = selectedClassroomId
    ? classrooms.find(c => c.id === selectedClassroomId)
    : null;

  // 生徒の上下位置の並べ替え
  const handleMoveStudent = useCallback(async (studentId: string, direction: 'up' | 'down') => {
    if (!selectedClassroom) return;
    const ids = [...selectedClassroom.studentIds];
    const idx = ids.indexOf(studentId);
    if (idx < 0) return;
    if (direction === 'up' && idx > 0) {
      [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
    } else if (direction === 'down' && idx < ids.length - 1) {
      [ids[idx], ids[idx + 1]] = [ids[idx + 1], ids[idx]];
    } else {
      return;
    }

    try {
      await upsertClassroom({
        ...selectedClassroom,
        studentIds: ids,
      });
      if (onReloadData) {
        await onReloadData();
      }
    } catch (err) {
      console.error('Failed to move student:', err);
    }
  }, [selectedClassroom, onReloadData]);

  const filteredStudents = useMemo(() => {
    if (!selectedClassroom) return allStudents;
    const enrolled = allStudents.filter(s => selectedClassroom.studentIds.includes(s.id));
    enrolled.sort((a, b) => {
      const idxA = selectedClassroom.studentIds.indexOf(a.id);
      const idxB = selectedClassroom.studentIds.indexOf(b.id);
      return idxA - idxB;
    });
    const extra = allStudents.filter(s =>
      !selectedClassroom.studentIds.includes(s.id) &&
      participants.some(p => studentIdentityCandidates(s).some(candidate => identityMatchesPlayer(p.identity, candidate)))
    );
    const combined = [...enrolled, ...extra];
    // ログイン中(接続中)の生徒を先頭に。Array.sortは安定ソートなので、
    // 接続中グループ内・未接続グループ内それぞれの相対順序(studentIdsの並び)は維持される。
    const isConnected = (s: Student) => participants.some(p =>
      studentIdentityCandidates(s).some(candidate => identityMatchesPlayer(p.identity, candidate)),
    );
    return combined.sort((a, b) => Number(isConnected(b)) - Number(isConnected(a)));
  }, [allStudents, selectedClassroom, participants]);

  // 接続してきた参加者は常に表示する（studentIds形式の不一致で誤除外しない）
  const filteredParticipants = participants;

  // 接続状況で絞らない: 教室の進行中対局はすべて表示する
  // （生徒が一時切断していても先生は対局を見失わない。gamesは既に教室単位で取得済み）
  const { boards: liveBoards } = useLiveBoards(liveGames);
  const filteredGames = useMemo(
    () => applyLiveBoardSnapshotsToSessions(games, liveBoards),
    [games, liveBoards],
  );

  const orphanLookupIdentities = useMemo(() => Array.from(new Set([
    ...filteredStudents.flatMap(student => studentIdentityCandidates(student)),
    ...participants
      .map(p => p.identity)
      .filter(identity => identity && identity !== localIdentity),
  ])), [filteredStudents, participants, localIdentity]);

  useEffect(() => {
    let cancelled = false;

    if (orphanLookupIdentities.length === 0) {
      setOrphanLiveGames([]);
      setOrphanGamesError(null);
      return;
    }

    fetchActiveLiveGamesForPlayers(orphanLookupIdentities)
      .then(rows => {
        if (cancelled) return;
        const visibleIds = new Set(games.map(g => g.id));
        setOrphanLiveGames(rows.filter(row => !visibleIds.has(row.id)));
        setOrphanGamesError(null);
      })
      .catch(err => {
        if (cancelled) return;
        setOrphanLiveGames([]);
        setOrphanGamesError(String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [orphanLookupIdentities, games]);

  const clearOrphanGame = useCallback(async (gameId: string) => {
    if (!confirm('講師側の通常一覧に表示されていない対局を強制終了し、生徒の「対局中」状態を解除します。よろしいですか？')) {
      return;
    }
    setClearingGameId(gameId);
    try {
      await finishGame(gameId, '強制解除');
      setOrphanLiveGames(prev => prev.filter(game => game.id !== gameId));
    } catch (err) {
      alert(`対局状態の解除に失敗しました: ${err}`);
    } finally {
      setClearingGameId(null);
    }
  }, []);

  // 生徒一覧とカメラの高さは、つまんで変えられる（残りはチャットが受け取る）
  const roster = useStoredHeight('roster', 72, 640);
  const video = useStoredHeight('video', 56, 480);
  const rosterRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLDivElement>(null);

  // タイトルバーのクラス名
  const classroomName = selectedClassroom?.name || '三村囲碁オンライン';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
      background: 'var(--color-raised)',
      color: 'var(--color-ink)',
      fontSize: 12,
    }}>
      {/* タイトルバー */}
      <div style={{
        background: 'var(--color-surface)',
        color: 'var(--color-ink)',
        padding: '10px 14px',
        borderBottom: '1px solid var(--color-line)',
        fontSize: 14,
        fontWeight: 700,
        letterSpacing: '.04em',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{
          background: 'var(--color-raised)',
          color: 'var(--color-ink)',
          borderRadius: '50%',
          width: 22,
          height: 22,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 10,
          fontWeight: 'bold',
        }}>囲</span>
        三村囲碁オンライン 〜 {classroomName}
      </div>

      {/* 生徒一覧テーブル */}
      {/* 生徒一覧。高さは下の取っ手で変えられる。詰めたぶんは中央と右のチャットに回る */}
      <div
        ref={rosterRef}
        style={{
          height: roster.height ?? undefined,
          maxHeight: roster.height === null ? 'min(35vh, 260px)' : undefined,
          overflowY: 'auto',
          flexShrink: 0,
        }}
      >
        <StudentTable
          participants={filteredParticipants}
          students={filteredStudents}
          games={filteredGames}
          audioPermissions={audioPermissions}
          localIdentity={localIdentity}
          onToggleHear={onToggleHear}
          onToggleMic={onToggleMic}
          onOpenHistory={handleOpenHistory}
          onStartGame={onStartGameWithStudent}
          onEditStudent={setEditingStudentInfo}
          onMoveStudent={handleMoveStudent}
          onOpenStudent={(identity) => {
            // 対局中(playing)の生徒のみ来る前提（StudentTable 側で gate 済み）
            const game = filteredGames.find(g =>
              (identityMatchesPlayer(identity, g.blackPlayer) || identityMatchesPlayer(identity, g.whitePlayer)) &&
              g.status === 'playing'
            );
            if (!game) return;
            // 先生自身の対局なら講師専用の別ウィンドウ（1盤表示+ローテーション）で開く
            if (identityMatchesPlayer(localIdentity, game.blackPlayer) || identityMatchesPlayer(localIdentity, game.whitePlayer)) {
              setObservingGameId(null);
              onOpenTeacherGameWindow();
            } else {
              setObservingGameId(game.id);
            }
          }}
        />
      </div>
      <VerticalResizer
        label="生徒一覧の高さ"
        targetRef={rosterRef}
        onResize={roster.commit}
        onCommit={roster.save}
      />

      {/* 中央: 碁盤グリッド/観戦 + 右サイドバー（ビデオ+チャット） */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 碁盤エリア: サムネイルグリッド or 観戦パネル（対局は常に講師専用の別ウィンドウで行うため、教室ホーム画面には対局盤を埋め込まない） */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {(orphanLiveGames.length > 0 || orphanGamesError) && (
            <div style={{
              margin: 8,
              padding: 8,
              background: 'color-mix(in oklab, var(--color-accent) 16%, var(--color-surface))',
              border: '2px solid #d6b279',
              color: 'var(--color-ink)',
              fontSize: 12,
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: 6 }}>
                講師一覧に出ていない対局
              </div>
              {orphanGamesError ? (
                <div>検出に失敗: {orphanGamesError}</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {orphanLiveGames.map(row => {
                    const game = liveRowToSession(row);
                    return (
                      <div
                        key={row.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          background: 'var(--color-ground)',
                          border: '1px solid #8a7554',
                          padding: '5px 8px',
                        }}
                      >
                        <span>
                          {resolvePlayerName(game.blackPlayer, allStudents)} (黒) vs {resolvePlayerName(game.whitePlayer, allStudents)} (白)
                          <span style={{ marginLeft: 8, color: 'var(--color-accent-text)' }}>
                            {row.status === 'interrupted' ? '中断' : row.status === 'scoring' ? '整地中' : '対局中'}
                          </span>
                        </span>
                        <button
                          onClick={() => clearOrphanGame(row.id)}
                          disabled={clearingGameId === row.id}
                          style={{
                            border: '1px solid transparent',
                            background: clearingGameId === row.id ? 'var(--color-line)' : 'var(--color-accent)',
                            color: clearingGameId === row.id ? 'var(--color-muted)' : 'var(--color-accent-ink)',
                            padding: '2px 10px',
                            cursor: clearingGameId === row.id ? 'not-allowed' : 'pointer',
                            fontWeight: 'bold',
                          }}
                        >
                          状態解除
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
          {observingGameId && filteredGames.find(g => g.id === observingGameId) ? (
            <GameObserverPanel
              gameId={observingGameId}
              students={filteredStudents}
              localIdentity={localIdentity}
              onBack={() => setObservingGameId(null)}
            />
          ) : (
            <BoardThumbnailGrid
              games={filteredGames}
              students={filteredStudents}
              participants={filteredParticipants}
              onSelectGame={(gameId) => {
                // 先生自身の対局なら講師専用の別ウィンドウ（1盤表示+ローテーション）で開く
                const game = filteredGames.find(g => g.id === gameId);
                if (game && (identityMatchesPlayer(localIdentity, game.blackPlayer) || identityMatchesPlayer(localIdentity, game.whitePlayer))) {
                  onOpenTeacherGameWindow();
                } else {
                  setObservingGameId(gameId);
                }
              }}
              onResumeGame={onResumeGame}
            />
          )}
        </div>

        {/* 右サイドバー */}
        <div style={{
          width: 280,
          borderLeft: '1px solid var(--color-line)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          background: 'var(--color-surface)',
        }}>
          {/* 右上: カメラ映像。高さは下の取っ手で変えられ、詰めたぶんは会話が受け取る。
              以前は下限 180px で固定していたため、窓を小さくすると入力欄が押し出されて
              見えなくなっていた（三村さん報告 2026-08-04、800×600 で下端より 63px 下）。 */}
          {videoElements.size > 0 ? (
            <div ref={videoRef} style={{
              background: '#000',
              height: video.height ?? 180,
              flexShrink: 0,
              overflow: 'hidden',
              position: 'relative',
            }}>
              <div style={{ padding: 4 }}>
                <VideoTiles
                  videoElements={videoElements}
                  localIdentity={localIdentity}
                  participants={participants}
                  students={allStudents}
                />
              </div>
            </div>
          ) : (
            // 誰も映像を出していないときに黒枠が居座ると、そのぶん会話が読めなくなる。
            // 何も映っていないことだけ伝えて、高さはチャットに渡す。
            <div style={{
              flexShrink: 0,
              padding: '4px 8px',
              borderBottom: '1px solid var(--color-line)',
              color: 'var(--color-muted)',
              fontSize: 11,
            }}>
              カメラ映像なし
            </div>
          )}

          {videoElements.size > 0 && (
            <VerticalResizer
              label="カメラの高さ"
              targetRef={videoRef}
              onResize={video.commit}
              onCommit={video.save}
            />
          )}

          {/* 音声・映像の設定。自分の入出力に関わるものをチャットの並びにまとめる */}
          <div style={{ flexShrink: 0, padding: '6px 8px', borderBottom: '1px solid var(--color-line)' }}>
            <MediaDeviceSettings classroom={classroom ?? null} />
          </div>

          {/* チャット。上の2つを詰めたぶんがここに来る */}
          <div style={{ flex: '1 1 auto', minHeight: 92 }}>
            <ChatPanel
              messages={chatMessages}
              participants={participants}
              students={filteredStudents}
              localIdentity={localIdentity}
              onSend={onChatSend}
            />
          </div>
        </div>
      </div>

      {/* ツールバー（IGC最下部） */}
      <TeacherToolbar
        studentJoinInfo={studentJoinInfo}
        classroomId={selectedClassroomId}
        classroomName={selectedClassroom?.name}
        onCreateGame={onCreateGame}
        onStartLecture={onStartLecture}
        onLoadSgf={onLoadSgf}
        onDisconnect={onDisconnect}
        onReconnect={onReconnect}
        isReconnecting={isReconnecting}
        onOpenStudentManager={onOpenStudentManager}
        onOpenTeacherGameWindow={onOpenTeacherGameWindow}
        onOpenTsumegoPicker={onProblemAssign ? () => setShowTsumegoPicker(true) : undefined}
        onEditClassroom={() => {
          if (selectedClassroom) setEditingClassroom(selectedClassroom);
        }}
        onShowStudentLinks={() => setShowStudentLinks(true)}
        onAutoPairing={() => setShowAutoPairing(true)}
        onClearAudioM={onClearAudioM}
        onClearAudioS={onClearAudioS}
        onClearSharing={onClearSharing}
      />

      {/* 詰碁データベース選択ダイアログ */}
      {showTsumegoPicker && onProblemAssign && (
        <TsumegoPickerDialog
          onAssign={onProblemAssign}
          onClose={() => setShowTsumegoPicker(false)}
        />
      )}

      {/* 教室設定ダイアログ（生徒入替） */}
      {editingClassroom && (
        <ClassroomSettingsDialog
          classroom={editingClassroom}
          allStudents={students}
          onSave={() => {
            setEditingClassroom(null);
            void onReloadData();
          }}
          onClose={() => setEditingClassroom(null)}
        />
      )}

      {/* 生徒リンク一覧 */}
      {showStudentLinks && (
        <StudentLinkGenerator
          students={filteredStudents}
          classroomId={selectedClassroomId || undefined}
          onClose={() => setShowStudentLinks(false)}
        />
      )}

      {/* 生徒情報の編集（段級位変更） */}
      {editingStudentInfo && (
        <StudentEditDialog
          student={editingStudentInfo}
          onClose={() => setEditingStudentInfo(null)}
          onSaved={onReloadData}
        />
      )}

      {/* 自動ペアリング */}
      {showAutoPairing && (
        <AutoPairingDialog
          connectedIdentities={participants.map(p => p.identity)}
          students={filteredStudents}
          teacherIdentity={localIdentity}
          onClose={() => setShowAutoPairing(false)}
          onCreateGames={onCreateGames}
        />
      )}

      {/* 棋譜履歴モーダル */}
      {historyStudent && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-line)',
            width: 600,
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            fontSize: 12,
            color: 'var(--color-ink)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}>
            {/* ヘッダー */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              background: 'var(--color-raised)',
              borderBottom: '1px solid var(--color-line)',
              fontWeight: 'bold',
              fontSize: 13,
            }}>
              <span>棋譜履歴 - {historyStudent.name} さん</span>
              <button onClick={() => setHistoryStudent(null)} style={{
                background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: 'var(--color-muted)',
              }}>&times;</button>
            </div>

            <div style={{ padding: 12, overflowY: 'auto', flex: 1 }}>
              {loadingHistory ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--color-muted)' }}>棋譜履歴を読み込み中...</div>
              ) : historyGames.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--color-muted)' }}>保存された棋譜履歴はありません。</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {historyGames.map(game => {
                    // 中断だけでなく、時間切れで終わった対局も講師なら再開できる（回線トラブル救済）
                    const resumableLiveGame = games.find(g => g.id === game.id && (
                      g.status === 'interrupted' ||
                      (g.status === 'finished' && isTimeoutResult(g.result))
                    ));
                    // この生徒がその対局で黒か白か（保存値は sid:/uuid/コード/名前 いずれか）
                    const matchesHistoryStudent = (raw: string) => {
                      const v = stripSid(raw || '');
                      return v === historyStudent.id || v === historyStudent.studentCode;
                    };
                    const studentColor = matchesHistoryStudent(game.blackPlayer)
                      ? 'BLACK'
                      : matchesHistoryStudent(game.whitePlayer)
                        ? 'WHITE'
                        : null;
                    // 結果表記 "B+..." / "W+..." から勝者を判定（強制終局・中断・ジゴは判定なし）
                    const winner = game.result?.startsWith('B')
                      ? 'BLACK'
                      : game.result?.startsWith('W')
                        ? 'WHITE'
                        : null;
                    const outcome = studentColor && winner
                      ? (studentColor === winner ? 'win' : 'loss')
                      : null;
                    // 勝ちは生成りで強く、負けは朱、それ以外は鈍色
                    const playerColor = outcome === 'win' ? 'var(--color-ink)' : outcome === 'loss' ? 'var(--color-alert-text)' : 'var(--color-muted)';
                    return (
                      <div
                        key={game.id}
                        onClick={() => {
                          onSelectSavedGame?.(game);
                          setHistoryStudent(null);
                        }}
                        style={{
                          background: 'var(--color-ground)',
                          border: '1px solid var(--color-line)',
                          padding: '8px 10px',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-raised)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-ground)'; }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', gap: 8 }}>
                          <span style={{ color: playerColor }}>
                            {resolvePlayerName(game.blackPlayer, allStudents)} (黒) vs {resolvePlayerName(game.whitePlayer, allStudents)} (白)
                            {outcome === 'win' && <span style={{ marginLeft: 6, fontSize: 11 }}>◯勝ち</span>}
                            {outcome === 'loss' && <span style={{ marginLeft: 6, fontSize: 11 }}>●負け</span>}
                          </span>
                          {resumableLiveGame && onResumeGame ? (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                if (resumableLiveGame.status === 'finished' &&
                                    !confirm('時間切れで終わったこの対局を再開しますか？（切れた側の時間は戻します）')) return;
                                onResumeGame(resumableLiveGame.id);
                                setHistoryStudent(null);
                              }}
                              style={{
                                background: 'var(--color-accent)',
                                border: '1px solid #8a7554',
                                color: 'var(--color-ground)',
                                fontSize: 11,
                                fontWeight: 'bold',
                                padding: '1px 8px',
                                cursor: 'pointer',
                              }}
                            >
                              再開
                            </button>
                          ) : (
                            <span style={{ color: 'var(--color-accent-text)', fontSize: 11 }}>検討を開始する</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--color-muted)', fontSize: 11 }}>
                          <span>対局日: {game.date}</span>
                          <span>{game.boardSize}路盤 | コミ: {game.komi} | 結果: {game.result || '不明'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* フッター */}
            <div style={{
              display: 'flex',
              justifyContent: 'flex-end',
              padding: '6px 10px',
              background: 'var(--color-raised)',
              borderTop: '1px solid var(--color-line)',
            }}>
              <button
                onClick={() => setHistoryStudent(null)}
                style={{
                  padding: '2px 10px',
                  background: 'var(--color-ground)',
                  border: '1px solid var(--color-line)',
                  cursor: 'pointer',
                  fontSize: 12,
                }}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
