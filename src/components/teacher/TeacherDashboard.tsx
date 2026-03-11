import { useEffect } from 'react';
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

interface TeacherDashboardProps {
  // 参加者
  participants: ParticipantInfo[];
  localIdentity: string;

  // 生徒・教室データ
  students: Student[];
  classrooms: Classroom[];
  selectedClassroomId: string | null;
  onSelectClassroom: (id: string | null) => void;

  // 対局
  games: GameSession[];
  onSelectGame: (gameId: string) => void;

  // 音声制御
  audioPermissions: AudioPermissions;
  onToggleHear: (identity: string) => void;
  onToggleMic: (identity: string) => void;

  // チャット
  chatMessages: ChatMessage[];
  onChatSend: (text: string, target: 'all' | string) => void;

  // ビデオ
  videoElements: Map<string, HTMLVideoElement>;

  // ツールバーアクション
  studentJoinInfo: string;
  onCreateGame: () => void;
  onStartLecture: () => void;
  onLoadSgf: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDisconnect: () => void;
  onOpenStudentManager: () => void;
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
}: TeacherDashboardProps) {
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

  // フィルタされた生徒に関連する対局のみ
  const filteredGames = selectedClassroom
    ? games.filter(g => {
        const identities = filteredParticipants.map(p => p.identity);
        return identities.includes(g.blackPlayer) || identities.includes(g.whitePlayer);
      })
    : games;

  const remoteCount = participants.filter(p => p.identity !== localIdentity).length;

  return (
    <div className="flex flex-col h-full gap-0">
      {/* 部屋タブ */}
      <RoomTabs
        classrooms={classrooms}
        selectedClassroomId={selectedClassroomId}
        onSelectClassroom={onSelectClassroom}
        participantCount={remoteCount}
      />

      {/* 生徒一覧テーブル */}
      <div className="border-b border-white/10 max-h-[30vh] overflow-y-auto">
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

      {/* 中央: 碁盤グリッド + 右サイドバー（ビデオ右上+チャット右下） */}
      <div className="flex-1 flex min-h-0">
        {/* 碁盤サムネイルグリッド */}
        <div className="flex-1 overflow-y-auto p-3">
          <BoardThumbnailGrid
            games={filteredGames}
            students={filteredStudents}
            participants={filteredParticipants}
            onSelectGame={onSelectGame}
          />
        </div>

        {/* 右サイドバー */}
        <div className="w-72 border-l border-white/10 flex flex-col min-h-0 hidden lg:flex">
          {/* 右上: ビデオ映像 */}
          <div className="border-b border-white/10 p-2 bg-black/30">
            {videoElements.size > 0 ? (
              <VideoTiles
                videoElements={videoElements}
                localIdentity={localIdentity}
              />
            ) : (
              <div className="text-xs text-zinc-600 text-center py-4">カメラOFFです</div>
            )}
          </div>

          {/* 右下: チャット */}
          <div className="flex-1 min-h-0">
            <ChatPanel
              messages={chatMessages}
              participants={participants}
              localIdentity={localIdentity}
              onSend={onChatSend}
            />
          </div>
        </div>
      </div>

      {/* ツールバー */}
      <TeacherToolbar
        studentJoinInfo={studentJoinInfo}
        onCreateGame={onCreateGame}
        onStartLecture={onStartLecture}
        onLoadSgf={onLoadSgf}
        onDisconnect={onDisconnect}
        onOpenStudentManager={onOpenStudentManager}
      />
    </div>
  );
}
