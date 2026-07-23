import { Download, LogOut, Volume2, VolumeX, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { ConnectionState } from 'livekit-client';
import type { Role } from '../utils/classroomLiveKit';
import RecordingControls from './RecordingControls';
import { usePwaInstall } from '../hooks/usePwaInstall';

interface HeaderProps {
  role: Role;
  userName: string;
  connectionState: ConnectionState;
  remoteCount: number;
  isMicEnabled: boolean;
  onToggleMic: () => void;
  isMuted: boolean;
  onToggleMute: () => void;
  isCameraEnabled?: boolean;
  onToggleCamera?: () => void;
  onDisconnect: () => void;
}

export default function Header({
  role,
  userName,
  connectionState,
  remoteCount,
  isMicEnabled,
  onToggleMic,
  isMuted,
  onToggleMute,
  isCameraEnabled,
  onToggleCamera,
  onDisconnect,
}: HeaderProps) {
  const isConnected = connectionState === ConnectionState.Connected;
  const pwaInstall = usePwaInstall();

  const handleInstallClick = async () => {
    await pwaInstall.install();
  };

  return (
    <header className="flex justify-between items-center glass-panel px-4 py-3">
      <div className="flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full ${
          isConnected ? 'bg-green-500 animate-pulse' :
          connectionState === ConnectionState.Reconnecting ? 'bg-yellow-500 animate-pulse' :
          'bg-red-500'
        }`} />
        <h2 className="font-bold text-lg">
          {role === 'TEACHER' ? '先生' : '生徒'}
        </h2>
        <span className="text-zinc-500 text-sm">{userName}</span>
        {isConnected && (
          <span className="text-xs text-zinc-600">
            {remoteCount}人接続中
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isConnected && (
          <>
            <button
              onClick={onToggleMic}
              className={`p-2 rounded-lg transition-all flex items-center gap-1.5 ${
                isMicEnabled
                  ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800 hover:bg-emerald-900/80'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700'
              }`}
              title={isMicEnabled ? 'マイクOFF' : 'マイクON'}
            >
              {isMicEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
              {role === 'STUDENT' && (
                <span className="text-xs font-bold whitespace-nowrap">
                  {isMicEnabled ? 'マイク中（自分の声を送っています）' : '自分の声を送る（マイク）'}
                </span>
              )}
            </button>
            <button
              onClick={onToggleMute}
              className={`p-2 rounded-lg transition-all ${
                isMuted
                  ? 'bg-rose-950/80 text-rose-400 border border-rose-800 hover:bg-rose-900/80'
                  : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700'
              }`}
              title={isMuted ? '音声ON' : '音声OFF'}
            >
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            {onToggleCamera && (
              <button
                onClick={onToggleCamera}
                className={`p-2 rounded-lg transition-all flex items-center gap-1.5 ${
                  isCameraEnabled
                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800 hover:bg-emerald-900/80'
                    : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700'
                }`}
                title={isCameraEnabled ? 'カメラOFF' : 'カメラON'}
              >
                {isCameraEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                {role === 'STUDENT' && (
                  <span className="text-xs font-bold whitespace-nowrap">
                    {isCameraEnabled ? '映像送信中（自分の顔を送っています）' : '自分の映像を送る（カメラ）'}
                  </span>
                )}
              </button>
            )}
          </>
        )}
        {role === 'TEACHER' && isConnected && <RecordingControls />}
        {pwaInstall.shouldShowInstall && (
          <button
            onClick={handleInstallClick}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600/15 text-blue-300 border border-blue-500/30 rounded-lg hover:bg-blue-600/25 transition-colors duration-150"
            title={pwaInstall.isIos && !pwaInstall.canInstall ? 'ホーム画面に追加' : 'アプリをインストール'}
          >
            <Download className="w-4 h-4" />
            インストール
          </button>
        )}
        <button
          onClick={onDisconnect}
          className="p-2 text-zinc-500 hover:text-red-400 transition-colors"
          title="切断"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
