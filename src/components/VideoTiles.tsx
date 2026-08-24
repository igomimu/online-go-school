import { useEffect, useRef } from 'react';
import { Maximize2, MicOff, VideoOff } from 'lucide-react';
import type { ParticipantInfo } from '../utils/classroomLiveKit';
import type { Student } from '../types/classroom';
import { resolvePlayerName } from '../utils/identityUtils';

interface VideoTilesProps {
  videoElements: Map<string, HTMLVideoElement>;
  localIdentity: string;
  participants?: ParticipantInfo[];
  students?: Student[];
  variant?: 'compact' | 'classroom';
  /** 講師画面の可変映像高。未指定なら従来の16:9既定サイズ。 */
  classroomTileHeight?: number;
  /** 自分のカメラが動いているか。一度も点けていないと映像そのものが無いので、代わりに枠を置く */
  isCameraEnabled?: boolean;
}

/**
 * カメラを止めても LiveKit は映像トラックを外さず「消音」にするだけなので、
 * タイルには黒い四角が残る。子どもには故障と区別が付かないので、
 * 止まっているあいだは黒の上に「カメラ オフ」を被せる。
 */
function CameraOffCover({ variant }: { variant: 'compact' | 'classroom' }) {
  const face = variant === 'classroom'
    ? 'bg-black/85 text-[#f8efec]'
    : 'rounded-lg border border-dashed border-alert/50 bg-raised text-alert-text';
  return (
    <div className={`absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 ${face}`}>
      <VideoOff className="h-6 w-6" />
      <span className="text-[11px] font-bold leading-none">カメラ オフ</span>
    </div>
  );
}

/** 声が出せない人の札。誰の声が届かないのかが一目で分かる */
function MicOffBadge({ variant }: { variant: 'compact' | 'classroom' }) {
  return (
    <span
      className={`absolute z-20 bg-alert-face p-1 text-[#f8efec] ${
        variant === 'classroom' ? 'left-1.5 top-1.5' : 'bottom-1 right-1 rounded'
      }`}
      title="マイクが切れています"
    >
      <MicOff className="h-3.5 w-3.5" />
    </span>
  );
}

function VideoTile({
  label,
  videoElement,
  isLocal,
  variant,
  classroomTileHeight,
  cameraOn,
  micOn,
}: {
  label: string;
  videoElement: HTMLVideoElement;
  isLocal: boolean;
  variant: 'compact' | 'classroom';
  classroomTileHeight?: number;
  cameraOn: boolean;
  micOn: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const displayLabel = isLocal ? '自分' : (label || '参加者');

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !videoElement) return;
    const video = videoElement;

    container.appendChild(video);

    return () => {
      if (container.contains(video)) {
        container.removeChild(video);
      }
    };
  }, [videoElement]);

  const showFullscreen = () => {
    if (!videoElement.requestFullscreen) return;
    void videoElement.requestFullscreen().catch(() => {
      // 全画面表示が端末側で拒否された場合は、現在の表示をそのまま維持する。
    });
  };

  if (variant === 'classroom') {
    return (
      <div
        className="group relative shrink-0 w-[168px] sm:w-[192px] aspect-video bg-black overflow-hidden border border-white/15"
        style={classroomTileHeight === undefined ? undefined : {
          height: classroomTileHeight,
          width: classroomTileHeight * (16 / 9),
        }}
      >
        <div
          ref={containerRef}
          // 自分の映像も鏡像にしない。生徒に届いているのは実像なので、
          // 碁盤や本を映したときに講師の画面だけ左右が逆になるのを避ける
          // （三村さんの指示 2026-08-24）。
          className="absolute inset-0 [&>video]:w-full [&>video]:h-full [&>video]:object-contain"
        />
        {!cameraOn && <CameraOffCover variant="classroom" />}
        {!micOn && <MicOffBadge variant="classroom" />}
        <span className="absolute inset-x-0 bottom-0 z-20 px-2 py-1 bg-black/70 text-xs text-white truncate">
          {displayLabel}
        </span>
        <button
          type="button"
          onClick={showFullscreen}
          className="absolute right-1.5 top-1.5 z-20 grid size-7 place-items-center border border-white/30 bg-black/65 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 transition-opacity duration-150"
          aria-label={`${displayLabel}の映像を全画面表示`}
          title="全画面表示"
        >
          <Maximize2 className="size-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <div className="relative h-[90px] w-[120px]">
        <div
          ref={containerRef}
          className="h-full w-full overflow-hidden rounded-lg bg-black/30 [&>video]:h-full [&>video]:w-full [&>video]:rounded-lg [&>video]:object-cover"
        />
        {!cameraOn && <CameraOffCover variant="compact" />}
        {!micOn && <MicOffBadge variant="compact" />}
      </div>
      <span className="text-xs text-muted truncate max-w-[120px]">
        {displayLabel}
      </span>
    </div>
  );
}

/**
 * 一度もカメラを点けていない自分の枠。
 * 映像が無いだけだと、子どもは「自分が映っていない」ことに気づかない。
 */
function SelfCameraOffTile() {
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div className="relative h-[90px] w-[120px]">
        <CameraOffCover variant="compact" />
      </div>
      <span className="max-w-[120px] truncate text-xs text-muted">自分</span>
    </div>
  );
}

export default function VideoTiles({
  videoElements,
  localIdentity,
  participants = [],
  students = [],
  variant = 'compact',
  classroomTileHeight,
  isCameraEnabled,
}: VideoTilesProps) {
  if (videoElements.size === 0) return null;

  // 一度もカメラを点けていないと自分の映像は存在しない。他の人が映っているときだけ枠を置く
  const showSelfPlaceholder = isCameraEnabled === false && !videoElements.has(localIdentity);

  // ローカルを先頭に表示
  const sortedEntries = Array.from(videoElements.entries()).sort(([a], [b]) => {
    if (a === localIdentity) return -1;
    if (b === localIdentity) return 1;
    return a.localeCompare(b);
  });

  // identity ではなく必ず実名を表示（ログイン・講師管理機能以外は実名）
  const labelFor = (identity: string): string => {
    if (identity === localIdentity) return '';
    const p = participants.find(pp => pp.identity === identity);
    return p?.name || resolvePlayerName(identity, students);
  };

  // 参加者情報が渡らない画面では状態が分からない。その場合は札を出さない
  // （映っているものをそのまま出す）。
  // 自分のカメラだけは App が持つ isCameraEnabled を正本にする。参加者一覧は
  // LiveKit のイベント経由で遅れて届くことがあり、点けた直後に自分の映像へ
  // 「カメラ オフ」が被る。
  const stateFor = (identity: string): { cameraOn: boolean; micOn: boolean } => {
    const isSelf = identity === localIdentity;
    const p = participants.find(pp => pp.identity === identity);
    if (isSelf && isCameraEnabled !== undefined) {
      return { cameraOn: isCameraEnabled, micOn: p ? p.audioEnabled : true };
    }
    if (!p) return { cameraOn: true, micOn: true };
    return { cameraOn: p.videoEnabled, micOn: p.audioEnabled };
  };

  return (
    <div
      className={variant === 'classroom' ? 'w-full overflow-x-auto bg-black px-3 py-2' : 'w-full overflow-x-auto px-4 py-2'}
      aria-label="参加者映像"
    >
      <div className={`flex w-max min-w-full gap-2 ${variant === 'classroom' ? 'justify-start' : 'justify-center'}`}>
        {showSelfPlaceholder && <SelfCameraOffTile />}
        {sortedEntries.map(([identity, element]) => {
          const { cameraOn, micOn } = stateFor(identity);
          return (
            <VideoTile
              key={identity}
              label={labelFor(identity)}
              videoElement={element}
              isLocal={identity === localIdentity}
              variant={variant}
              classroomTileHeight={classroomTileHeight}
              cameraOn={cameraOn}
              micOn={micOn}
            />
          );
        })}
      </div>
    </div>
  );
}
