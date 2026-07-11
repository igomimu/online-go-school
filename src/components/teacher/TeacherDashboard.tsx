import { useEffect, useState, useCallback, useMemo } from 'react';
import type { GameSession, AudioPermissions, SavedGame } from '../../types/game';
import type { ParticipantInfo } from '../../utils/classroomLiveKit';
import type { Student, Classroom } from '../../types/classroom';
import type { ChatMessage } from '../../types/chat';
import { parseIdentity, resolvePlayerName, stripSid } from '../../utils/identityUtils';
import { getSupabase } from '../../utils/liveGameApi';
import { parseSGFTree } from '../../utils/sgfUtils';
import { createEmptyBoard } from '../../utils/gameLogic';
import type { Problem } from '../../types/problem';
import type { StoneColor } from '../GoBoard';
import { loadSavedGamesForStudent } from '../../utils/savedGames';

import StudentTable from './StudentTable';
import BoardThumbnailGrid from './BoardThumbnailGrid';
import ChatPanel from './ChatPanel';
import RoomTabs from './RoomTabs';
import TeacherToolbar from './TeacherToolbar';
import VideoTiles from '../VideoTiles';
import ClassroomSettingsDialog from './ClassroomSettingsDialog';
import StudentLinkGenerator from './StudentLinkGenerator';
import AutoPairingDialog from './AutoPairingDialog';
import GameObserverPanel from './GameObserverPanel';
import StudentEditDialog from './StudentEditDialog';
import SimulGrid from './SimulGrid';
import type { LiveGameRow } from '../../utils/liveGameApi';
import { upsertClassroom } from '../../utils/classroomStore';

interface TeacherDashboardProps {
  participants: ParticipantInfo[];
  localIdentity: string;
  students: Student[];
  classrooms: Classroom[];
  selectedClassroomId: string | null;
  onSelectClassroom: (id: string | null) => void;
  games: GameSession[];
  audioPermissions: AudioPermissions;
  onToggleHear: (identity: string) => void;
  onToggleMic: (identity: string) => void;
  chatMessages: ChatMessage[];
  onChatSend: (text: string, target: 'all' | string) => void;
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
  onResetVideo?: () => void;
  onSelectSavedGame?: (game: SavedGame) => void;
  onResumeGame?: (gameId: string) => void;
  liveGames: LiveGameRow[];
  showSimulGrid: boolean;
  onShowSimulGrid: () => void;
  onHideSimulGrid: () => void;
  onCreateSimulGame: (opts: {
    blackPlayer: string;
    whitePlayer: string;
    boardSize: number;
    handicap: number;
    komi: number;
    clock?: import('../../types/game').GameClock | null;
  }) => Promise<void>;
  classroom?: import('../../utils/classroomLiveKit').ClassroomLiveKit | null;
}

export default function TeacherDashboard({
  participants,
  localIdentity,
  students,
  classrooms,
  selectedClassroomId,
  onSelectClassroom,
  games,
  audioPermissions,
  onToggleHear,
  onToggleMic,
  chatMessages,
  onChatSend,
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
  onResetVideo,
  onSelectSavedGame,
  onResumeGame,
  liveGames,
  showSimulGrid,
  onShowSimulGrid,
  onHideSimulGrid,
  onCreateSimulGame,
  classroom,
}: TeacherDashboardProps) {
  const [editingClassroom, setEditingClassroom] = useState<Classroom | null>(null);
  const [showStudentLinks, setShowStudentLinks] = useState(false);
  const [showAutoPairing, setShowAutoPairing] = useState(false);
  const [observingGameId, setObservingGameId] = useState<string | null>(null);
  const [editingStudentInfo, setEditingStudentInfo] = useState<Student | null>(null);

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
  const allStudents = [...students, ...resolvedStudents.filter(r => !students.find(s => s.id === r.id))];

  // 詰碁SGF読み込み
  const handleLoadProblem = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !onProblemAssign) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) return;
      try {
        const parsed = parseSGFTree(content);
        const root = parsed.root;
        const boardSize = parsed.size || 19;
        let correctColor: StoneColor = 'BLACK';
        if (root.children.length > 0 && root.children[0].move) {
          correctColor = root.children[0].move.color;
        }
        const problem: Problem = {
          id: crypto.randomUUID(),
          title: parsed.metadata?.gameName || file.name.replace(/\.sgf$/i, '') || '詰碁',
          boardSize,
          initialBoard: parsed.board || createEmptyBoard(boardSize),
          correctColor,
          sgfTree: root,
          createdAt: new Date().toISOString(),
        };
        onProblemAssign(problem);
      } catch (err) {
        console.error('Problem SGF parse error:', err);
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  }, [onProblemAssign]);

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
      participants.some(p => p.identity.includes(s.id))
    );
    return [...enrolled, ...extra];
  }, [allStudents, selectedClassroom, participants]);

  // 接続してきた参加者は常に表示する（studentIds形式の不一致で誤除外しない）
  const filteredParticipants = participants;

  // 接続状況で絞らない: 教室の進行中対局はすべて表示する
  // （生徒が一時切断していても先生は対局を見失わない。gamesは既に教室単位で取得済み）
  const filteredGames = games;

  // タイトルバーのクラス名
  const classroomName = selectedClassroom?.name || '三村囲碁オンライン';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: 0,
      background: '#d0d0c8',
      color: '#333',
      fontFamily: 'MS Gothic, "Noto Sans JP", monospace',
      fontSize: 12,
    }}>
      {/* タイトルバー（IGC風） */}
      <div style={{
        background: '#3030a0',
        color: 'white',
        padding: '4px 10px',
        fontSize: 13,
        fontWeight: 'bold',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{
          background: '#333',
          color: 'white',
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
        <button
          onClick={() => {
            setObservingGameId(null);
            onShowSimulGrid();
          }}
          style={{
            marginLeft: 'auto',
            border: '1px solid rgba(255,255,255,0.7)',
            background: showSimulGrid ? '#f59e0b' : 'rgba(255,255,255,0.15)',
            color: showSimulGrid ? '#111' : '#fff',
            padding: '2px 10px',
            cursor: 'pointer',
            fontWeight: 'bold',
            fontSize: 12,
          }}
        >
          多面打ち
        </button>
      </div>

      {/* 生徒一覧テーブル */}
      <div style={{ maxHeight: '35vh', overflowY: 'auto', borderBottom: '2px solid #999' }}>
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
              (g.blackPlayer === identity || g.whitePlayer === identity) && g.status === 'playing'
            );
            if (game) setObservingGameId(game.id);
          }}
        />
      </div>

      {/* 中央: 碁盤グリッド/観戦 + 右サイドバー（ビデオ+チャット） */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 碁盤エリア: サムネイルグリッド or 観戦パネル */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {showSimulGrid ? (
            <SimulGrid
              games={liveGames}
              students={filteredStudents}
              participants={filteredParticipants}
              teacherIdentity={localIdentity}
              onCreateGame={onCreateSimulGame}
              onBack={onHideSimulGrid}
              classroom={classroom}
            />
          ) : observingGameId && filteredGames.find(g => g.id === observingGameId) ? (
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
              onSelectGame={(gameId) => setObservingGameId(gameId)}
              onResumeGame={onResumeGame}
            />
          )}
        </div>

        {/* 右サイドバー */}
        <div style={{
          width: 280,
          borderLeft: '2px solid #999',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          background: '#e8e8e0',
        }}>
          {/* 右上: ビデオ映像エリア（黒背景） */}
          <div style={{
            background: '#000',
            minHeight: 180,
            borderBottom: '1px solid #999',
            position: 'relative',
          }}>
            {videoElements.size > 0 ? (
              <div style={{ padding: 4 }}>
                <VideoTiles
                  videoElements={videoElements}
                  localIdentity={localIdentity}
                  participants={participants}
                  students={allStudents}
                />
              </div>
            ) : (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#555',
                fontSize: 11,
              }}>
                カメラ映像
              </div>
            )}
          </div>

          {/* チャット */}
          <div style={{ flex: 1, minHeight: 0 }}>
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
        onLoadProblem={handleLoadProblem}
        onEditClassroom={() => {
          if (selectedClassroom) setEditingClassroom(selectedClassroom);
        }}
        onShowStudentLinks={() => setShowStudentLinks(true)}
        onAutoPairing={() => setShowAutoPairing(true)}
        onClearAudioM={onClearAudioM}
        onClearAudioS={onClearAudioS}
        onClearSharing={onClearSharing}
        onResetVideo={onResetVideo}
      />

      {/* 部屋タブ（IGC最下部） */}
      <RoomTabs
        classrooms={classrooms}
        selectedClassroomId={selectedClassroomId}
        onSelectClassroom={onSelectClassroom}
      />

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
            background: '#e8e8e0',
            border: '2px solid #666',
            width: 600,
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column',
            fontFamily: 'MS Gothic, "Noto Sans JP", monospace',
            fontSize: 12,
            color: '#333',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}>
            {/* ヘッダー */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 10px',
              background: '#d0d0c8',
              borderBottom: '1px solid #999',
              fontWeight: 'bold',
              fontSize: 13,
            }}>
              <span>棋譜履歴 - {historyStudent.name} さん</span>
              <button onClick={() => setHistoryStudent(null)} style={{
                background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', color: '#666',
              }}>&times;</button>
            </div>

            <div style={{ padding: 12, overflowY: 'auto', flex: 1 }}>
              {loadingHistory ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#666' }}>棋譜履歴を読み込み中...</div>
              ) : historyGames.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '20px 0', color: '#666' }}>保存された棋譜履歴はありません。</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {historyGames.map(game => {
                    const interruptedLiveGame = games.find(g => g.id === game.id && g.status === 'interrupted');
                    // この生徒がその対局で黒か白か（保存値は sid:/uuid/コード/名前 いずれか）
                    const matchesHistoryStudent = (raw: string) => {
                      const v = stripSid(raw || '');
                      return v === historyStudent.id || v === historyStudent.studentCode || v === historyStudent.name;
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
                    // 勝ちは青字、負けは赤字
                    const playerColor = outcome === 'win' ? '#0055cc' : outcome === 'loss' ? '#cc0000' : '#333';
                    return (
                      <div
                        key={game.id}
                        onClick={() => {
                          onSelectSavedGame?.(game);
                          setHistoryStudent(null);
                        }}
                        style={{
                          background: '#fff',
                          border: '1px solid #ccc',
                          padding: '8px 10px',
                          cursor: 'pointer',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: 4,
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = '#f0f0e8'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', gap: 8 }}>
                          <span style={{ color: playerColor }}>
                            {resolvePlayerName(game.blackPlayer, allStudents)} (黒) vs {resolvePlayerName(game.whitePlayer, allStudents)} (白)
                            {outcome === 'win' && <span style={{ marginLeft: 6, fontSize: 11 }}>◯勝ち</span>}
                            {outcome === 'loss' && <span style={{ marginLeft: 6, fontSize: 11 }}>●負け</span>}
                          </span>
                          {interruptedLiveGame && onResumeGame ? (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                onResumeGame(interruptedLiveGame.id);
                                setHistoryStudent(null);
                              }}
                              style={{
                                background: '#f59e0b',
                                border: '1px solid #b45309',
                                color: '#fff',
                                fontSize: 11,
                                fontWeight: 'bold',
                                padding: '1px 8px',
                                cursor: 'pointer',
                              }}
                            >
                              再開
                            </button>
                          ) : (
                            <span style={{ color: '#0066cc', fontSize: 11 }}>検討を開始する</span>
                          )}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#666', fontSize: 11 }}>
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
              background: '#d0d0c8',
              borderTop: '1px solid #999',
            }}>
              <button
                onClick={() => setHistoryStudent(null)}
                style={{
                  padding: '2px 10px',
                  background: '#fff',
                  border: '1px solid #999',
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
