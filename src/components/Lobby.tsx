import { Copy, Check, Upload, Users, Plus, BookOpen, Link } from 'lucide-react';
import { useState, useRef } from 'react';
import type { GameSession, SavedGame } from '../types/game';
import type { ParticipantInfo } from '../utils/classroomLiveKit';
import type { Student, Classroom } from '../types/classroom';
import type { ChatMessage } from '../types/chat';
import { findStudentByIdentity, getDisplayName } from '../utils/identityUtils';
import GameThumbnail from './GameThumbnail';
import SavedGameList from './SavedGameList';
import ClassroomSelector from './ClassroomSelector';
import ChatPanel from './teacher/ChatPanel';

interface LobbyProps {
  role: 'TEACHER' | 'STUDENT';
  participants: ParticipantInfo[];
  localIdentity: string;
  activeSpeakers: string[];
  games: GameSession[];
  studentJoinInfo: string;

  // 先生用
  onCreateGame?: () => void;
  onStartLecture?: () => void;
  onLoadSgf?: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onSelectSavedGame?: (game: SavedGame) => void;

  // 対局選択
  onSelectGame: (gameId: string) => void;
  myIdentity: string;

  // 生徒・教室データ
  students?: Student[];
  classrooms?: Classroom[];
  selectedClassroomId?: string | null;
  onSelectClassroom?: (id: string | null) => void;
  onOpenStudentManager?: () => void;

  // 入室中の教室表示（生徒側の「部屋に入った」感を出すためのヘッダー用）
  currentClassroomName?: string;
  currentStudentName?: string;

  // チャット（生徒側で表示）
  chatMessages?: ChatMessage[];
  onChatSend?: (text: string, target: 'all' | string) => void;
  onResumeGame?: (gameId: string) => void;
}

export default function Lobby({
  role,
  participants,
  localIdentity,
  activeSpeakers,
  games,
  studentJoinInfo,
  onCreateGame,
  onStartLecture,
  onLoadSgf,
  onSelectSavedGame,
  onSelectGame,
  myIdentity,
  students = [],
  classrooms = [],
  selectedClassroomId,
  onSelectClassroom,
  onOpenStudentManager,
  currentClassroomName,
  currentStudentName,
  chatMessages,
  onChatSend,
  onResumeGame,
}: LobbyProps) {
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const playingGames = games.filter(g => g.status === 'playing');
  const finishedGames = games.filter(g => g.status === 'finished');

  // 自分が参加中の対局
  const myGame = games.find(g =>
    g.status === 'playing' && (g.blackPlayer === myIdentity || g.whitePlayer === myIdentity)
  );

  // 自分が参加中の中断対局
  const mySuspendedGame = games.find(g =>
    g.status === 'interrupted' && (g.blackPlayer === myIdentity || g.whitePlayer === myIdentity)
  );

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* 入室ヘッダー: どの教室に入ったか明示（生徒の「部屋に入った」感） */}
      {role === 'STUDENT' && currentClassroomName && (
        <div
          className="glass-panel p-6 border-blue-400/40"
          style={{
            background: 'linear-gradient(135deg, rgba(59,130,246,0.18), rgba(99,102,241,0.12))',
            boxShadow: '0 0 30px rgba(59,130,246,0.15)',
          }}
        >
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="text-xs font-medium text-blue-300 uppercase tracking-wider">
                入室中
              </p>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mt-1 truncate">
                {currentClassroomName}
              </h2>
              <p className="text-sm text-zinc-300 mt-2">
                先生がレッスンを始めるのを待ってください
              </p>
            </div>
            {currentStudentName && (
              <div className="text-right shrink-0">
                <p className="text-xs text-zinc-400">ようこそ</p>
                <p className="text-lg font-semibold text-white mt-0.5">
                  {currentStudentName} さん
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6 w-full">
      {/* メインエリア */}
      <div className="flex-1 space-y-4">
        {/* 自分の対局があればハイライト */}
        {myGame && role === 'STUDENT' && (
          <div className="glass-panel p-4 bg-blue-500/10 border-blue-500/30">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-blue-400">対局中</h3>
                <p className="text-sm text-zinc-400">
                  {myGame.blackPlayer} vs {myGame.whitePlayer} ({myGame.moveNumber}手目)
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onSelectGame(myGame.id)}
                  className="premium-button text-sm"
                >
                  碁盤を開く
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 中断された対局があれば再開ボタンを提示 */}
        {mySuspendedGame && role === 'STUDENT' && !myGame && (
          <div className="glass-panel p-4 bg-yellow-500/10 border-yellow-500/30">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-bold text-yellow-400">中断された対局があります</h3>
                <p className="text-sm text-zinc-400">
                  {mySuspendedGame.blackPlayer} vs {mySuspendedGame.whitePlayer} ({mySuspendedGame.moveNumber}手目)
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onResumeGame?.(mySuspendedGame.id)}
                  className="premium-button text-sm bg-yellow-600/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-600/30 flex items-center gap-1.5"
                >
                  対局を再開する
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 先生用アクションボタン */}
        {role === 'TEACHER' && (
          <div className="flex gap-3 flex-wrap">
            <button onClick={onCreateGame} className="premium-button flex items-center gap-2">
              <Plus className="w-4 h-4" /> 対局を作成
            </button>
            <button onClick={onStartLecture} className="secondary-button flex items-center gap-2">
              <BookOpen className="w-4 h-4" /> 授業モード
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".sgf"
              onChange={onLoadSgf}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="secondary-button flex items-center gap-2"
            >
              <Upload className="w-4 h-4" /> SGF読込
            </button>
          </div>
        )}

        {/* 進行中の対局一覧 */}
        {playingGames.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-bold text-lg">進行中の対局</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {playingGames.map(game => (
                <GameThumbnail
                  key={game.id}
                  game={game}
                  onClick={() => onSelectGame(game.id)}
                  isActive={myGame?.id === game.id}
                  students={students}
                />
              ))}
            </div>
          </div>
        )}

        {/* 終了した対局 */}
        {finishedGames.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-bold">終了した対局</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {finishedGames.map(game => (
                <GameThumbnail
                  key={game.id}
                  game={game}
                  onClick={() => onSelectGame(game.id)}
                  students={students}
                  onResume={onResumeGame}
                />
              ))}
            </div>
          </div>
        )}

        {games.length === 0 && (
          <div className="glass-panel p-8 text-center text-zinc-500">
            {role === 'TEACHER'
              ? '「対局を作成」で生徒同士の対局を組めます'
              : '先生が対局を作成するのをお待ちください'}
          </div>
        )}
      </div>

      {/* サイドバー */}
      <div className="w-full lg:w-72 space-y-4">
        {/* 参加リンク（先生のみ） */}
        {role === 'TEACHER' && studentJoinInfo && (
          <div className="glass-panel p-4 space-y-3">
            <h3 className="font-bold flex items-center gap-2 text-sm">
              <Link className="w-4 h-4" /> 参加リンク
            </h3>
            <div className="bg-white/5 rounded-lg p-2 text-xs font-mono break-all max-h-16 overflow-y-auto">
              {studentJoinInfo}
            </div>
            <button
              onClick={() => copyToClipboard(studentJoinInfo)}
              className="secondary-button w-full flex items-center justify-center gap-2 text-sm"
            >
              {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
              {copied ? 'コピー済み' : 'リンクをコピー'}
            </button>
          </div>
        )}

        {/* 教室セレクター（先生のみ） */}
        {role === 'TEACHER' && classrooms.length > 0 && onSelectClassroom && onOpenStudentManager && (
          <div className="glass-panel p-4">
            <ClassroomSelector
              classrooms={classrooms}
              students={students}
              selectedClassroomId={selectedClassroomId ?? null}
              onSelectClassroom={onSelectClassroom}
              onOpenManager={onOpenStudentManager}
            />
          </div>
        )}

        {/* 参加者一覧 */}
        <div className="glass-panel p-4 space-y-3">
          <h3 className="font-bold flex items-center gap-2 text-sm">
            <Users className="w-4 h-4" /> 参加者 ({participants.length})
          </h3>
          <div className="space-y-1">
            {participants.map(p => {
              const isLocal = p.identity === localIdentity;
              const isSpeaking = activeSpeakers.includes(p.identity);
              // この生徒は対局中か？
              const inGame = games.some(g =>
                g.status === 'playing' && (g.blackPlayer === p.identity || g.whitePlayer === p.identity)
              );
              // 登録生徒の棋力をID/名前マッチで検索
              const registered = findStudentByIdentity(p.identity, students);
              const name = p.name || getDisplayName(p.identity, students);
              return (
                <div
                  key={p.identity}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-sm ${
                    isSpeaking ? 'bg-green-500/10 border border-green-500/20' : 'bg-white/5'
                  }`}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`truncate ${isLocal ? 'font-semibold' : ''}`}>
                      {name}
                      {isLocal && <span className="text-zinc-500 ml-1">(自分)</span>}
                    </span>
                    {registered?.rank && (
                      <span className="px-1 py-0.5 rounded bg-amber-500/20 text-amber-300 text-xs font-mono shrink-0">
                        {registered.rank}
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-zinc-600 shrink-0 ml-1">
                    {inGame ? '対局中' : '待機中'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 保存棋譜（先生のみ） */}
        {role === 'TEACHER' && onSelectSavedGame && (
          <div className="glass-panel p-4 space-y-3">
            <h3 className="font-bold text-sm">保存棋譜</h3>
            <SavedGameList onSelectGame={onSelectSavedGame} />
          </div>
        )}

        {/* チャット（生徒のみ。先生は TeacherDashboard 内で表示） */}
        {role === 'STUDENT' && chatMessages && onChatSend && (
          <div className="glass-panel p-0 overflow-hidden" style={{ height: 320 }}>
            <ChatPanel
              messages={chatMessages}
              participants={participants}
              students={students}
              localIdentity={localIdentity}
              onSend={onChatSend}
              showTargetSelector={false}
            />
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
