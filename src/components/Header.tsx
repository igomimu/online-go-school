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
        {/* 接続状態は色相ではなく明度で示す。繋がっていれば地に対してはっきりと、
            復旧中は鈍色で明滅、切れていれば朱。 */}
        <div className={`w-3 h-3 rounded-full ${
          isConnected ? 'bg-ink' :
          connectionState === ConnectionState.Reconnecting ? 'bg-muted animate-pulse' :
          'bg-alert'
        }`} />
        <h2 className="font-bold text-lg">
          {role === 'TEACHER' ? '先生' : '生徒'}
        </h2>
        <span className="text-muted text-sm">{userName}</span>
        {isConnected && (
          <span className="text-xs text-muted/75">
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
                  ? 'bg-ink/8 text-ink hover:bg-ink/10'
                  : 'bg-ink/5 text-muted hover:bg-ink/10'
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
                  ? 'bg-alert/15 text-alert-text hover:bg-alert/25'
                  : 'bg-ink/5 text-muted hover:bg-ink/10'
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
                    ? 'bg-ink/8 text-ink hover:bg-ink/10'
                    : 'bg-ink/5 text-muted hover:bg-ink/10'
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
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-accent/12 text-accent-text border border-accent/35 rounded-lg hover:bg-accent/18 transition-colors duration-150"
            title={pwaInstall.isIos && !pwaInstall.canInstall ? 'ホーム画面に追加' : 'アプリをインストール'}
          >
            <Download className="w-4 h-4" />
            インストール
          </button>
        )}
        <button
          onClick={onDisconnect}
          className="p-2 text-muted hover:text-alert-text transition-colors"
          title="切断"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
