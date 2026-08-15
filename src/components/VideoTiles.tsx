import { useEffect, useRef } from 'react';
import { Maximize2 } from 'lucide-react';
import type { ParticipantInfo } from '../utils/classroomLiveKit';
import type { Student } from '../types/classroom';
import { resolvePlayerName } from '../utils/identityUtils';

interface VideoTilesProps {
  videoElements: Map<string, HTMLVideoElement>;
  localIdentity: string;
  participants?: ParticipantInfo[];
  students?: Student[];
  variant?: 'compact' | 'classroom';
}

function VideoTile({
  label,
  videoElement,
  isLocal,
  variant,
}: {
  label: string;
  videoElement: HTMLVideoElement;
  isLocal: boolean;
  variant: 'compact' | 'classroom';
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
      <div className="group relative shrink-0 w-[168px] sm:w-[192px] aspect-video bg-black overflow-hidden border border-white/15">
        <div
          ref={containerRef}
          className={`absolute inset-0 [&>video]:w-full [&>video]:h-full [&>video]:object-contain ${isLocal ? '[&>video]:scale-x-[-1]' : ''}`}
        />
        <span className="absolute inset-x-0 bottom-0 z-10 px-2 py-1 bg-black/70 text-xs text-white truncate">
          {displayLabel}
        </span>
        <button
          type="button"
          onClick={showFullscreen}
          className="absolute right-1.5 top-1.5 z-10 grid size-7 place-items-center border border-white/30 bg-black/65 text-white opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 transition-opacity duration-150"
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
      <div
        ref={containerRef}
        className={`w-[120px] h-[90px] bg-black/30 rounded-lg overflow-hidden [&>video]:w-full [&>video]:h-full [&>video]:object-cover [&>video]:rounded-lg ${isLocal ? '[&>video]:scale-x-[-1]' : ''}`}
      />
      <span className="text-xs text-muted truncate max-w-[120px]">
        {displayLabel}
      </span>
    </div>
  );
}

export default function VideoTiles({
  videoElements,
  localIdentity,
  participants = [],
  students = [],
  variant = 'compact',
}: VideoTilesProps) {
  if (videoElements.size === 0) return null;

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

  return (
    <div
      className={variant === 'classroom' ? 'w-full overflow-x-auto bg-black px-3 py-2' : 'w-full overflow-x-auto px-4 py-2'}
      aria-label="参加者映像"
    >
      <div className={`flex w-max min-w-full gap-2 ${variant === 'classroom' ? 'justify-start' : 'justify-center'}`}>
        {sortedEntries.map(([identity, element]) => (
          <VideoTile
            key={identity}
            label={labelFor(identity)}
            videoElement={element}
            isLocal={identity === localIdentity}
            variant={variant}
          />
        ))}
      </div>
    </div>
  );
}
