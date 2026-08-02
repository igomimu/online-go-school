import { Copy, Check, Upload, Users, Plus, BookOpen, Link } from 'lucide-react';
import { useState, useRef } from 'react';
import type { GameSession, SavedGame } from '../types/game';
import type { ParticipantInfo } from '../utils/classroomLiveKit';
import type { Student, Classroom } from '../types/classroom';
import type { ChatMessage } from '../types/chat';
import { findStudentByIdentity, getDisplayName, identityMatchesPlayer } from '../utils/identityUtils';
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
    g.status === 'playing' &&
    (identityMatchesPlayer(myIdentity, g.blackPlayer) || identityMatchesPlayer(myIdentity, g.whitePlayer))
  );

  // 自分が参加中の中断対局
  const mySuspendedGame = games.find(g =>
    g.status === 'interrupted' &&
    (identityMatchesPlayer(myIdentity, g.blackPlayer) || identityMatchesPlayer(myIdentity, g.whitePlayer))
  );

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* 入室ヘッダー: どの教室に入ったか明示（生徒の「部屋に入った」感） */}
      {role === 'STUDENT' && currentClassroomName && (
        <div className="glass-panel border-l-2 border-l-kaya p-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="text-xs tracking-widest text-nibi">入室中</p>
              <h2 className="mt-1 truncate text-2xl font-bold sm:text-3xl">
                {currentClassroomName}
              </h2>
              <p className="mt-2 text-sm text-nibi">
                先生がレッスンを始めるのを待ってください
              </p>
            </div>
            {currentStudentName && (
              <div className="shrink-0 text-right">
                <p className="text-xs text-nibi">ようこそ</p>
                <p className="mt-0.5 text-lg font-semibold">
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
          <div className="glass-panel border-l-2 border-l-kaya p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-kaya">対局中</h3>
                <p className="text-sm text-nibi">
                  {myGame.blackPlayer} vs {myGame.whitePlayer}（<span className="tabular">{myGame.moveNumber}</span>手目）
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
          <div className="glass-panel border-l-2 border-l-nibi p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold">中断された対局があります</h3>
                <p className="text-sm text-nibi">
                  {mySuspendedGame.blackPlayer} vs {mySuspendedGame.whitePlayer}（<span className="tabular">{mySuspendedGame.moveNumber}</span>手目）
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onResumeGame?.(mySuspendedGame.id)}
                  className="premium-button flex items-center gap-1.5 text-sm"
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
            <h3 className="heading-section text-base">進行中の対局</h3>
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
            <h3 className="heading-section">終了した対局</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {finishedGames.map(game => (
                <GameThumbnail
                  key={game.id}
                  game={game}
                  onClick={() => onSelectGame(game.id)}
                  students={students}
                  onResume={onResumeGame}
                  allowTimeoutResume={role === 'TEACHER'}
                />
              ))}
            </div>
          </div>
        )}

        {games.length === 0 && (
          <div className="glass-panel p-8 text-nibi">
            {role === 'TEACHER'
              ? '「対局を作成」で生徒同士の対局を組めます'
              : '先生が対局を作成するのをお待ちください'}
          </div>
        )}
      </div>

      {/* サイドバー */}
      <div className="w-full lg:w-72 space-y-5">
        {/* 参加リンク（先生のみ） */}
        {role === 'TEACHER' && studentJoinInfo && (
          <div className="glass-panel p-5 space-y-3">
            <h3 className="heading-section flex items-center gap-2">
              <Link className="w-4 h-4" /> 参加リンク
            </h3>
            <div className="max-h-16 overflow-y-auto break-all rounded-lg bg-sumi p-2 font-mono text-xs text-nibi">
              {studentJoinInfo}
            </div>
            <button
              onClick={() => copyToClipboard(studentJoinInfo)}
              className="secondary-button w-full flex items-center justify-center gap-2 text-sm"
            >
              {copied ? <Check className="w-4 h-4 text-kaya" /> : <Copy className="w-4 h-4" />}
              {copied ? 'コピー済み' : 'リンクをコピー'}
            </button>
          </div>
        )}

        {/* 教室セレクター（先生のみ） */}
        {role === 'TEACHER' && classrooms.length > 0 && onSelectClassroom && onOpenStudentManager && (
          <div className="glass-panel p-5">
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
        <div className="glass-panel p-5 space-y-3">
          <h3 className="heading-section flex items-center gap-2">
            <Users className="w-4 h-4" /> 参加者 ({participants.length})
          </h3>
          <div className="space-y-1">
            {participants.map(p => {
              const isLocal = p.identity === localIdentity;
              const isSpeaking = activeSpeakers.includes(p.identity);
              // この生徒は対局中か？
              const inGame = games.some(g =>
                g.status === 'playing' &&
                (identityMatchesPlayer(p.identity, g.blackPlayer) || identityMatchesPlayer(p.identity, g.whitePlayer))
              );
              // 登録生徒の棋力をID/名前マッチで検索
              const registered = findStudentByIdentity(p.identity, students);
              const name = p.name || getDisplayName(p.identity, students);
              return (
                <div
                  key={p.identity}
                  className={`flex items-center justify-between rounded-lg border px-3 py-1.5 text-sm ${
                    isSpeaking ? 'border-kaya/50 bg-sumi-high' : 'border-transparent bg-sumi-high'
                  }`}
                >
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className={`truncate ${isLocal ? 'font-semibold' : ''}`}>
                      {name}
                      {isLocal && <span className="ml-1 text-nibi">(自分)</span>}
                    </span>
                    {registered?.rank && (
                      <span className="tabular shrink-0 rounded border border-sumi-line px-1 py-0.5 text-xs text-nibi">
                        {registered.rank}
                      </span>
                    )}
                  </div>
                  <span className={`ml-1 shrink-0 text-xs ${inGame ? 'text-kaya' : 'text-nibi'}`}>
                    {inGame ? '対局中' : '待機中'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 保存棋譜（先生のみ） */}
        {role === 'TEACHER' && onSelectSavedGame && (
          <div className="glass-panel p-5 space-y-3">
            <h3 className="heading-section">保存棋譜</h3>
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
