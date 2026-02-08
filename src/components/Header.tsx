import { LogOut, Volume2, VolumeX, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { ConnectionState } from 'livekit-client';
import type { Role } from '../utils/classroomLiveKit';

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
              className={`p-2 rounded-lg transition-all ${
                isMicEnabled
                  ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                  : 'bg-white/5 text-zinc-500 hover:bg-white/10'
              }`}
              title={isMicEnabled ? 'マイクOFF' : 'マイクON'}
            >
              {isMicEnabled ? <Mic className="w-5 h-5" /> : <MicOff className="w-5 h-5" />}
            </button>
            <button
              onClick={onToggleMute}
              className={`p-2 rounded-lg transition-all ${
                isMuted
                  ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                  : 'bg-white/5 text-zinc-400 hover:bg-white/10'
              }`}
              title={isMuted ? '音声ON' : '音声OFF'}
            >
              {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
            </button>
            {onToggleCamera && (
              <button
                onClick={onToggleCamera}
                className={`p-2 rounded-lg transition-all ${
                  isCameraEnabled
                    ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                    : 'bg-white/5 text-zinc-500 hover:bg-white/10'
                }`}
                title={isCameraEnabled ? 'カメラOFF' : 'カメラON'}
              >
                {isCameraEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
              </button>
            )}
          </>
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
