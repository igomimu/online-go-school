import { Download, LogOut, Volume2, VolumeX, Mic, MicOff, Video, VideoOff } from 'lucide-react';
import { ConnectionState } from '../utils/classroomRtc';
import type { Role } from '../utils/classroomRtc';
import RecordingControls from './RecordingControls';
import ThemeToggle from './ThemeToggle';
import MediaDeviceSettings from './MediaDeviceSettings';
import type { ClassroomRtc } from '../utils/classroomRtc';
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
  /** 自分の声が実際に拾えているか（マイクが生きている証拠を子どもに見せる） */
  isSpeaking?: boolean;
  onDisconnect: () => void;
  /** 使用マイク・カメラの切り替えに使う */
  classroom?: ClassroomRtc | null;
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
  isSpeaking = false,
  onDisconnect,
  classroom,
}: HeaderProps) {
  const isConnected = connectionState === ConnectionState.Connected;
  const pwaInstall = usePwaInstall();

  const handleInstallClick = async () => {
    await pwaInstall.install();
  };

  // 生徒のメディアボタンは3つを等分に並べる。以前は説明文をそのままラベルにしていたため、
  // スマホ幅で名前や「1人接続中」が1文字ずつ縦積みになり、カメラのボタンは画面外に切れて
  // 押せなかった。押せることを優先し、説明は title に残す。
  //
  // 状態は「面の明暗」だけに頼らない。子どもは薄い色の差を状態として読まないので、
  // アイコンの斜線・「オン / オフ」の語・小さな色面（榧＝動いている / 朱＝止まっている）の
  // 3つを重ねる。色が見分けられなくても語で分かる、語が読めなくても斜線で分かる。
  const studentMediaButton = (active: boolean, speaking = false) =>
    `flex min-h-[58px] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-lg border px-1 py-1.5 transition-colors duration-150 ${
      active
        ? 'border-accent/35 bg-accent/12 text-accent-text'
        : 'border-line bg-raised text-muted hover:bg-line'
    } ${speaking ? 'ring-2 ring-accent' : ''}`;

  // オン/オフの札。オフは朱の面に白抜きで、押し忘れているものが遠目にも分かる
  const stateChip = (on: boolean) =>
    `rounded px-2 py-0.5 text-xs font-bold leading-none ${
      on ? 'bg-accent text-accent-ink' : 'bg-alert-face text-[#f8efec]'
    }`;

  return (
    <header className="glass-panel flex flex-col gap-2 overflow-x-hidden px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:px-4 sm:py-3">
      {/* 1段目: 状態。テキストは潰さない（nowrap / truncate）。 */}
      <div className="flex min-w-0 items-center gap-2 sm:gap-3">
        {/* 接続状態は色相ではなく明度で示す。繋がっていれば地に対してはっきりと、
            復旧中は鈍色で明滅、切れていれば朱。 */}
        <div className={`h-3 w-3 shrink-0 rounded-full ${
          isConnected ? 'bg-ink' :
          connectionState === ConnectionState.Reconnecting ? 'bg-muted animate-pulse' :
          'bg-alert'
        }`} />
        <h2 className="shrink-0 whitespace-nowrap text-base font-bold sm:text-lg">
          {role === 'TEACHER' ? '先生' : '生徒'}
        </h2>
        <span className="truncate text-sm text-muted">{userName}</span>
        {isConnected && (
          <span className="ml-auto shrink-0 whitespace-nowrap text-xs text-muted/75 sm:ml-0">
            {remoteCount}人接続中
          </span>
        )}
      </div>

      {/* 2段目: 操作 */}
      <div className="flex min-w-0 items-center gap-2">
        {isConnected && role === 'STUDENT' && (
          <div className="flex min-w-0 flex-1 items-stretch gap-2">
            <button
              onClick={onToggleMic}
              className={studentMediaButton(isMicEnabled, isMicEnabled && isSpeaking)}
              aria-pressed={isMicEnabled}
              title={isMicEnabled ? '自分の声を送っています（押すと止める）' : '自分の声を送る'}
            >
              {isMicEnabled
                ? <Mic className="h-5 w-5" />
                : <MicOff className="h-5 w-5 text-alert-text" />}
              <span className="text-[11px] font-bold leading-none">マイク</span>
              <span className={stateChip(isMicEnabled)}>{isMicEnabled ? 'オン' : 'オフ'}</span>
            </button>
            <button
              onClick={onToggleMute}
              className={studentMediaButton(!isMuted)}
              aria-pressed={!isMuted}
              title={isMuted ? '相手の声が切れています（押すと聞こえる）' : '相手の声が聞こえています（押すと止める）'}
            >
              {isMuted
                ? <VolumeX className="h-5 w-5 text-alert-text" />
                : <Volume2 className="h-5 w-5" />}
              <span className="text-[11px] font-bold leading-none">スピーカー</span>
              <span className={stateChip(!isMuted)}>{isMuted ? 'オフ' : 'オン'}</span>
            </button>
            {onToggleCamera && (
              <button
                onClick={onToggleCamera}
                className={studentMediaButton(!!isCameraEnabled)}
                aria-pressed={!!isCameraEnabled}
                title={isCameraEnabled ? '自分の顔を送っています（押すと止める）' : '自分の映像を送る'}
              >
                {isCameraEnabled
                  ? <Video className="h-5 w-5" />
                  : <VideoOff className="h-5 w-5 text-alert-text" />}
                <span className="text-[11px] font-bold leading-none">カメラ</span>
                <span className={stateChip(!!isCameraEnabled)}>{isCameraEnabled ? 'オン' : 'オフ'}</span>
              </button>
            )}
          </div>
        )}
        {isConnected && role === 'TEACHER' && (
          <>
            <button
              onClick={onToggleMic}
              className={`shrink-0 rounded-lg p-2 transition-all ${
                isMicEnabled
                  ? 'bg-ink/8 text-ink hover:bg-ink/10'
                  : 'bg-ink/5 text-muted hover:bg-ink/10'
              }`}
              title={isMicEnabled ? 'マイクOFF' : 'マイクON'}
            >
              {isMicEnabled ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5 text-alert-text" />}
            </button>
            <button
              onClick={onToggleMute}
              className={`shrink-0 rounded-lg p-2 transition-all ${
                isMuted
                  ? 'bg-alert/15 text-alert-text hover:bg-alert/25'
                  : 'bg-ink/5 text-muted hover:bg-ink/10'
              }`}
              title={isMuted ? '音声ON' : '音声OFF'}
            >
              {isMuted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
            {onToggleCamera && (
              <button
                onClick={onToggleCamera}
                className={`shrink-0 rounded-lg p-2 transition-all ${
                  isCameraEnabled
                    ? 'bg-ink/8 text-ink hover:bg-ink/10'
                    : 'bg-ink/5 text-muted hover:bg-ink/10'
                }`}
                title={isCameraEnabled ? 'カメラOFF' : 'カメラON'}
              >
                {isCameraEnabled ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5 text-alert-text" />}
              </button>
            )}
          </>
        )}
        <div className="flex shrink-0 items-center gap-1">
          {isConnected && <MediaDeviceSettings classroom={classroom ?? null} iconOnly />}
          {role === 'TEACHER' && isConnected && <RecordingControls classroom={classroom} />}
          <ThemeToggle />
          {pwaInstall.shouldShowInstall && (
            <button
              onClick={handleInstallClick}
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-accent/35 bg-accent/12 px-3 py-1.5 text-xs text-accent-text transition-colors duration-150 hover:bg-accent/18"
              title={pwaInstall.isIos && !pwaInstall.canInstall ? 'ホーム画面に追加' : 'アプリをインストール'}
            >
              <Download className="h-4 w-4" />
              インストール
            </button>
          )}
          <button
            onClick={onDisconnect}
            className="shrink-0 p-2 text-muted transition-colors hover:text-alert-text"
            title="切断"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </header>
  );
}
