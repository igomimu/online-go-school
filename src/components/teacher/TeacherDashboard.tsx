import { useEffect, useState } from 'react';
import type { GameSession, AudioPermissions } from '../../types/game';
import type { ParticipantInfo } from '../../utils/classroomLiveKit';
import type { Student, Classroom } from '../../types/classroom';
import type { ChatMessage } from '../../types/chat';

import StudentTable from './StudentTable';
import BoardThumbnailGrid from './BoardThumbnailGrid';
import ChatPanel from './ChatPanel';
import RoomTabs from './RoomTabs';
import TeacherToolbar from './TeacherToolbar';
import VideoTiles from '../VideoTiles';
import ClassroomSettingsDialog from './ClassroomSettingsDialog';

interface TeacherDashboardProps {
  participants: ParticipantInfo[];
  localIdentity: string;
  students: Student[];
  classrooms: Classroom[];
  selectedClassroomId: string | null;
  onSelectClassroom: (id: string | null) => void;
  games: GameSession[];
  onSelectGame: (gameId: string) => void;
  audioPermissions: AudioPermissions;
  onToggleHear: (identity: string) => void;
  onToggleMic: (identity: string) => void;
  chatMessages: ChatMessage[];
  onChatSend: (text: string, target: 'all' | string) => void;
  videoElements: Map<string, HTMLVideoElement>;
  studentJoinInfo: string;
  onCreateGame: () => void;
  onStartLecture: () => void;
  onLoadSgf: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDisconnect: () => void;
  onOpenStudentManager: () => void;
  onReloadData: () => void;
}

export default function TeacherDashboard({
  participants,
  localIdentity,
  students,
  classrooms,
  selectedClassroomId,
  onSelectClassroom,
  games,
  onSelectGame,
  audioPermissions,
  onToggleHear,
  onToggleMic,
  chatMessages,
  onChatSend,
  videoElements,
  studentJoinInfo,
  onCreateGame,
  onStartLecture,
  onLoadSgf,
  onDisconnect,
  onOpenStudentManager,
  onReloadData,
}: TeacherDashboardProps) {
  const [editingClassroom, setEditingClassroom] = useState<Classroom | null>(null);
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

  const filteredStudents = selectedClassroom
    ? students.filter(s => selectedClassroom.studentIds.includes(s.id))
    : students;

  const filteredParticipants = selectedClassroom
    ? participants.filter(p => {
        const student = students.find(s => s.name === p.identity);
        return student ? selectedClassroom.studentIds.includes(student.id) : false;
      })
    : participants;

  const filteredGames = selectedClassroom
    ? games.filter(g => {
        const identities = filteredParticipants.map(p => p.identity);
        return identities.includes(g.blackPlayer) || identities.includes(g.whitePlayer);
      })
    : games;

  // タイトルバーのクラス名
  const classroomName = selectedClassroom?.name || 'オンライン囲碁教室';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
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
        オンライン囲碁教室 〜 {classroomName}
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
        />
      </div>

      {/* 中央: 碁盤グリッド + 右サイドバー（ビデオ+チャット） */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* 碁盤サムネイルグリッド */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <BoardThumbnailGrid
            games={filteredGames}
            students={filteredStudents}
            participants={filteredParticipants}
            onSelectGame={onSelectGame}
          />
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

          {/* 自分の映像を表示チェック + ボタン */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 6px',
            borderBottom: '1px solid #999',
          }}>
            <label style={{ fontSize: 11, flex: 1, color: '#333' }}>
              <input type="checkbox" defaultChecked className="mr-1" />
              自分の映像を表示
            </label>
            <button style={{
              padding: '2px 8px', fontSize: 11, border: '1px solid #999',
              background: '#e0f0e0', cursor: 'pointer',
            }}>教室カメラ</button>
            <button style={{
              padding: '2px 8px', fontSize: 11, border: '1px solid #999',
              background: '#e8e8e0', cursor: 'pointer',
            }}>時間精算</button>
          </div>

          {/* チャット */}
          <div style={{ flex: 1, minHeight: 0 }}>
            <ChatPanel
              messages={chatMessages}
              participants={participants}
              localIdentity={localIdentity}
              onSend={onChatSend}
            />
          </div>
        </div>
      </div>

      {/* ツールバー（IGC最下部） */}
      <TeacherToolbar
        studentJoinInfo={studentJoinInfo}
        onCreateGame={onCreateGame}
        onStartLecture={onStartLecture}
        onLoadSgf={onLoadSgf}
        onDisconnect={onDisconnect}
        onOpenStudentManager={onOpenStudentManager}
        onEditClassroom={() => {
          if (selectedClassroom) setEditingClassroom(selectedClassroom);
        }}
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
            onReloadData();
          }}
          onClose={() => setEditingClassroom(null)}
        />
      )}
    </div>
  );
}
