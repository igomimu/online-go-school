import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Trash2 } from 'lucide-react';
import type { GameSession, AudioPermissions, SavedGame } from '../../types/game';
import type { ParticipantInfo } from '../../utils/classroomLiveKit';
import type { Student, Classroom, RankDisplay } from '../../types/classroom';
import { DEFAULT_RANK_DISPLAY } from '../../types/classroom';
import type { ChatMessage } from '../../types/chat';
import { identityMatchesPlayer, parseIdentity, resolvePlayerName, stripSid, studentIdentityCandidates } from '../../utils/identityUtils';
import { deleteSavedGame, deleteSavedGames, fetchActiveLiveGamesForPlayers, finishGame, getSupabase, interruptGame, liveRowToSession, type LiveGameRow } from '../../utils/liveGameApi';
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
import { buildRosterUrl } from '../../utils/classroomRoster';
import VideoTiles from '../VideoTiles';
import ClassroomSettingsDialog from './ClassroomSettingsDialog';
import StudentLinkGenerator from './StudentLinkGenerator';
import AutoPairingDialog from './AutoPairingDialog';
import GameObserverPanel from './GameObserverPanel';
import StudentEditDialog from './StudentEditDialog';
import TsumegoPickerDialog from './TsumegoPickerDialog';
import RankDisplaySwitcher from './RankDisplaySwitcher';
import { updateClassroomRankDisplay, upsertClassroom } from '../../utils/classroomStore';
import { applyLiveBoardSnapshotsToSessions, useLiveBoards } from '../../hooks/useLiveBoards';

interface TeacherDashboardProps {
  participants: ParticipantInfo[];
  localIdentity: string;
  students: Student[];
  classrooms: Classroom[];
  studentTypes: string[];
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
  onCreateGame: (initialPlayer?: string) => void;
  onStartLecture: () => void;
  onLoadSgf: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDisconnect: () => void;
  onReconnect: () => void;
  isReconnecting: boolean;
  /** 回線の状態。ツールバーの「回線復旧」を切断時だけ朱にするために使う */
  connectionState?: import('livekit-client').ConnectionState;
  onOpenStudentManager: () => void;
  onReloadData: () => void | Promise<void>;
  /** 取消後、Realtimeが不調でもホームから確実に消すため対局一覧を再取得する。 */
  onReloadGames?: () => void | Promise<void>;
  /** 棋力表示を切り替えたことを生徒へ配る（名簿を読み直さない生徒のため） */
  onRankDisplayChanged?: (value: RankDisplay) => void;
  onCreateGames: (pairs: { blackPlayer: string; whitePlayer: string; boardSize: number; handicap: number; komi: number; clock?: import('../../types/game').GameClock }[]) => void;
  onProblemAssign?: (problem: import('../../types/problem').Problem) => void;
  onClearAudioM?: () => void;
  onClearAudioS?: () => void;
  onClearSharing?: () => void;
  /** 検討の参加者（null=全員）と、その切替 */
  sharingTargets?: import('../../utils/sharingTargets').SharingTargets;
  onToggleSharing?: (identity: string) => void;
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
  studentTypes,
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
  onStartLecture,
  onLoadSgf,
  onDisconnect,
  onReconnect,
  isReconnecting,
  connectionState,
  onOpenStudentManager,
  onReloadData,
  onReloadGames,
  onRankDisplayChanged,
  onCreateGames,
  onProblemAssign,
  onClearAudioM,
  onClearAudioS,
  onClearSharing,
  sharingTargets,
  onToggleSharing,
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
  const [rankDisplayOverride, setRankDisplayOverride] = useState<{
    classroomId: string;
    value: RankDisplay;
  } | null>(null);
  const [rankDisplaySaving, setRankDisplaySaving] = useState(false);
  const [rankDisplayError, setRankDisplayError] = useState<string | null>(null);

  // 棋譜履歴表示用のステート
  const [historyStudent, setHistoryStudent] = useState<Student | null>(null);
  const [historyGames, setHistoryGames] = useState<SavedGame[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [deletingHistoryGameId, setDeletingHistoryGameId] = useState<string | null>(null);
  // まとめて消すための選択。テスト対局が溜まると1件ずつでは片付かない
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<string>>(new Set());
  const [bulkDeleteProgress, setBulkDeleteProgress] = useState<{ done: number; total: number } | null>(null);

  const handleOpenHistory = useCallback(async (student: Student) => {
    setHistoryStudent(student);
    setSelectedHistoryIds(new Set());
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

  // 保存直後から一覧へ反映し、名簿の再読込が追いついたら親データへ戻す。
  const effectiveRankDisplay =
    rankDisplayOverride?.classroomId === selectedClassroomId
      ? rankDisplayOverride.value
      : selectedClassroom?.rankDisplay ?? DEFAULT_RANK_DISPLAY;

  useEffect(() => {
    setRankDisplayError(null);
    setRankDisplayOverride(current => {
      if (!current || current.classroomId !== selectedClassroomId) return null;
      return selectedClassroom?.rankDisplay === current.value ? null : current;
    });
  }, [selectedClassroomId, selectedClassroom?.rankDisplay]);

  const handleRankDisplayChange = useCallback(async (next: RankDisplay) => {
    if (!selectedClassroom || rankDisplaySaving || next === effectiveRankDisplay) return;

    setRankDisplayOverride({ classroomId: selectedClassroom.id, value: next });
    setRankDisplaySaving(true);
    setRankDisplayError(null);
    try {
      await updateClassroomRankDisplay(selectedClassroom.id, next);
      onRankDisplayChanged?.(next);
      await onReloadData();
    } catch (err) {
      console.error('Failed to update rank display:', err);
      setRankDisplayOverride(null);
      setRankDisplayError('保存できませんでした');
    } finally {
      setRankDisplaySaving(false);
    }
  }, [selectedClassroom, rankDisplaySaving, effectiveRankDisplay, onReloadData, onRankDisplayChanged]);

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

  const handleInterruptGame = useCallback(async (gameId: string) => {
    if (!confirm('この対局を中断しますか？\nあとで「再開」から続けられます。')) return;
    try {
      await interruptGame(gameId);
    } catch (err) {
      alert(`対局の中断に失敗しました: ${err}`);
    }
  }, []);

  const handleDeleteHistoryGame = useCallback(async (game: SavedGame) => {
    const interruptedNote = game.result === '中断'
      ? '\nこの中断局は再開できなくなり、ホームの表示からも消えます。'
      : '';
    if (!confirm(`この棋譜を削除しますか？${interruptedNote}`)) return;

    setDeletingHistoryGameId(game.id);
    try {
      await deleteSavedGame(game.id);
      setHistoryGames(prev => prev.filter(saved => saved.id !== game.id));
      setSelectedHistoryIds(prev => {
        if (!prev.has(game.id)) return prev;
        const next = new Set(prev);
        next.delete(game.id);
        return next;
      });
      await onReloadGames?.();
    } catch (err) {
      alert(`棋譜の削除に失敗しました: ${err}`);
    } finally {
      setDeletingHistoryGameId(null);
    }
  }, [onReloadGames]);

  const toggleHistorySelection = useCallback((gameId: string) => {
    setSelectedHistoryIds(prev => {
      const next = new Set(prev);
      if (next.has(gameId)) next.delete(gameId);
      else next.add(gameId);
      return next;
    });
  }, []);

  const toggleAllHistorySelection = useCallback(() => {
    setSelectedHistoryIds(prev => (
      prev.size === historyGames.length ? new Set() : new Set(historyGames.map(game => game.id))
    ));
  }, [historyGames]);

  const handleDeleteSelectedHistoryGames = useCallback(async () => {
    const targets = historyGames.filter(game => selectedHistoryIds.has(game.id));
    if (targets.length === 0) return;

    const interruptedCount = targets.filter(game => game.result === '中断').length;
    const interruptedNote = interruptedCount > 0
      ? `\nうち中断局が${interruptedCount}局あります。再開できなくなり、ホームの表示からも消えます。`
      : '';
    if (!confirm(`選択した${targets.length}件の棋譜を削除しますか？${interruptedNote}`)) return;

    setBulkDeleteProgress({ done: 0, total: targets.length });
    try {
      const { deleted, failed } = await deleteSavedGames(
        targets.map(game => game.id),
        (done, total) => setBulkDeleteProgress({ done, total }),
      );
      const deletedIds = new Set(deleted);
      setHistoryGames(prev => prev.filter(saved => !deletedIds.has(saved.id)));
      // 消せなかった分だけ選択に残す。もう一度押せばそれだけを試せる
      setSelectedHistoryIds(new Set(failed.map(f => f.id)));
      await onReloadGames?.();
      if (failed.length > 0) {
        alert(`${deleted.length}件を削除しました。${failed.length}件は削除できませんでした: ${failed[0].error}`);
      }
    } finally {
      setBulkDeleteProgress(null);
    }
  }, [historyGames, selectedHistoryIds, onReloadGames]);

  const handleCancelGame = useCallback(async (gameId: string) => {
    if (!confirm('この対局を取り消します。\n中断中の記録を含め、棋譜履歴には残りません。よろしいですか？')) return;
    try {
      await finishGame(gameId, '取消');
      await onReloadGames?.();
    } catch (err) {
      alert(`対局の取り消しに失敗しました: ${err}`);
    }
  }, [onReloadGames]);

  // 生徒一覧の高さは、つまんで変えられる
  const roster = useStoredHeight('roster', 72, 640);
  const rosterRef = useRef<HTMLDivElement>(null);
  // 参加者映像も、縦長のカメラや表情を大きく見たい場面に合わせて広げられる。
  const videoStrip = useStoredHeight('video-strip', 96, 360);
  const videoStripRef = useRef<HTMLDivElement>(null);

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
      {/* 参加者映像は教室全体を見渡せるよう、細い右欄ではなく上部へ横一列に置く。 */}
      {videoElements.size > 0 && (
        <div
          ref={videoStripRef}
          data-testid="teacher-video-strip"
          style={{
            flexShrink: 0,
            height: videoStrip.height ?? undefined,
            background: '#000',
            borderBottom: '1px solid var(--color-line)',
            overflow: 'hidden',
          }}
        >
          <VideoTiles
            videoElements={videoElements}
            localIdentity={localIdentity}
            participants={participants}
            students={allStudents}
            variant="classroom"
            classroomTileHeight={videoStrip.height === null ? undefined : Math.max(64, videoStrip.height - 16)}
          />
        </div>
      )}
      {videoElements.size > 0 && (
        <VerticalResizer
          label="参加者映像の高さ"
          targetRef={videoStripRef}
          onResize={videoStrip.commit}
          onCommit={videoStrip.save}
          showLabel
        />
      )}

      {/* タイトルバー */}
      <div data-testid="teacher-classroom-title" style={{
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
        <span>三村囲碁オンライン 〜 {classroomName}</span>
        {selectedClassroom && (
          <RankDisplaySwitcher
            value={effectiveRankDisplay}
            disabled={rankDisplaySaving}
            message={rankDisplaySaving ? '保存中…' : rankDisplayError}
            onChange={value => { void handleRankDisplayChange(value); }}
          />
        )}
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
          rankDisplay={effectiveRankDisplay}
          participants={filteredParticipants}
          students={filteredStudents}
          games={filteredGames}
          audioPermissions={audioPermissions}
          localIdentity={localIdentity}
          onToggleHear={onToggleHear}
          onToggleMic={onToggleMic}
          sharingTargets={sharingTargets}
          onToggleSharing={onToggleSharing}
          onCreateGame={onCreateGame}
          onOpenHistory={handleOpenHistory}
          onInterruptGame={gameId => { void handleInterruptGame(gameId); }}
          onResumeGame={onResumeGame}
          onCancelGame={gameId => { void handleCancelGame(gameId); }}
          onEditStudent={setEditingStudentInfo}
          onMoveStudent={handleMoveStudent}
        />
      </div>
      <VerticalResizer
        label="生徒一覧の高さ"
        targetRef={rosterRef}
        onResize={roster.commit}
        onCommit={roster.save}
      />

      {/* 中央: 碁盤グリッド/観戦 + 右サイドバー（音声設定+チャット） */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 碁盤エリア: サムネイルグリッド or 観戦パネル（対局は常に講師専用の別ウィンドウで行うため、教室ホーム画面には対局盤を埋め込まない）。
            高さは生徒一覧のリサイザー次第で半端になるので、盤の行に吸着させて
            「下段が途中で切れたまま」にならないようにする。 */}
        <div style={{ flex: 1, overflowY: 'auto', scrollSnapType: 'y proximity' }}>
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
              rankDisplay={effectiveRankDisplay}
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
        onCreateGame={() => onCreateGame()}
        onStartLecture={onStartLecture}
        onLoadSgf={onLoadSgf}
        onDisconnect={onDisconnect}
        onReconnect={onReconnect}
        isReconnecting={isReconnecting}
        connectionState={connectionState}
        rosterUrl={selectedClassroom?.rosterToken ? buildRosterUrl(selectedClassroom.rosterToken) : undefined}
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
          studentTypes={studentTypes}
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
          studentTypes={studentTypes}
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
                  {/* まとめて選んで消す。1件ずつでは片付かない数のテスト対局が溜まる */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    paddingBottom: 6,
                    borderBottom: '1px solid var(--color-line)',
                  }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={selectedHistoryIds.size === historyGames.length && historyGames.length > 0}
                        onChange={toggleAllHistorySelection}
                        aria-label="すべての棋譜を選ぶ"
                        style={{ cursor: 'pointer' }}
                      />
                      <span>すべて選ぶ（{historyGames.length}件）</span>
                    </label>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {bulkDeleteProgress && (
                        <span style={{ color: 'var(--color-muted)', fontSize: 11 }}>
                          {bulkDeleteProgress.done}/{bulkDeleteProgress.total}件を削除中…
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={selectedHistoryIds.size === 0 || bulkDeleteProgress !== null}
                        onClick={() => { void handleDeleteSelectedHistoryGames(); }}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          border: '1px solid var(--color-line)',
                          background: 'var(--color-ground)',
                          color: selectedHistoryIds.size === 0 ? 'var(--color-muted)' : 'var(--color-alert-text)',
                          fontSize: 11,
                          padding: '2px 8px',
                          cursor: selectedHistoryIds.size === 0 || bulkDeleteProgress !== null ? 'not-allowed' : 'pointer',
                          opacity: selectedHistoryIds.size === 0 || bulkDeleteProgress !== null ? 0.55 : 1,
                        }}
                      >
                        <Trash2 size={12} aria-hidden="true" />
                        選んだ{selectedHistoryIds.size}件を削除
                      </button>
                    </span>
                  </div>
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
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                            <input
                              type="checkbox"
                              checked={selectedHistoryIds.has(game.id)}
                              onClick={e => e.stopPropagation()}
                              onChange={() => toggleHistorySelection(game.id)}
                              aria-label={`${game.date}の棋譜を選ぶ`}
                              style={{ cursor: 'pointer', flexShrink: 0 }}
                            />
                            <span style={{ color: playerColor }}>
                              {resolvePlayerName(game.blackPlayer, allStudents)} (黒) vs {resolvePlayerName(game.whitePlayer, allStudents)} (白)
                              {outcome === 'win' && <span style={{ marginLeft: 6, fontSize: 11 }}>◯勝ち</span>}
                              {outcome === 'loss' && <span style={{ marginLeft: 6, fontSize: 11 }}>●負け</span>}
                            </span>
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
                            <button
                              type="button"
                              title="この棋譜を削除"
                              aria-label={`${game.date}の棋譜を削除`}
                              disabled={deletingHistoryGameId === game.id || bulkDeleteProgress !== null}
                              onClick={e => {
                                e.stopPropagation();
                                void handleDeleteHistoryGame(game);
                              }}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                border: '1px solid var(--color-line)',
                                background: 'var(--color-ground)',
                                color: 'var(--color-muted)',
                                fontSize: 11,
                                padding: '1px 6px',
                                cursor: deletingHistoryGameId === game.id ? 'wait' : 'pointer',
                                opacity: deletingHistoryGameId === game.id ? 0.55 : 1,
                              }}
                            >
                              <Trash2 size={12} aria-hidden="true" />
                              削除
                            </button>
                          </span>
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
