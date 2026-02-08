import { Copy, Check, Upload, Users, Plus, BookOpen, Link } from 'lucide-react';
import { useState, useRef } from 'react';
import type { GameSession, SavedGame } from '../types/game';
import type { ParticipantInfo } from '../utils/classroomLiveKit';
import GameThumbnail from './GameThumbnail';
import SavedGameList from './SavedGameList';

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

  return (
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
              <button
                onClick={() => onSelectGame(myGame.id)}
                className="premium-button text-sm"
              >
                碁盤を開く
              </button>
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
              return (
                <div
                  key={p.identity}
                  className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-sm ${
                    isSpeaking ? 'bg-green-500/10 border border-green-500/20' : 'bg-white/5'
                  }`}
                >
                  <span className={isLocal ? 'font-semibold' : ''}>
                    {p.identity}
                    {isLocal && <span className="text-zinc-500 ml-1">(自分)</span>}
                  </span>
                  <span className="text-xs text-zinc-600">
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
      </div>
    </div>
  );
}
