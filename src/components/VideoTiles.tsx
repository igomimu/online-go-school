import { useEffect, useRef } from 'react';
import type { ParticipantInfo } from '../utils/classroomLiveKit';
import type { Student } from '../types/classroom';
import { resolvePlayerName } from '../utils/identityUtils';

interface VideoTilesProps {
  videoElements: Map<string, HTMLVideoElement>;
  localIdentity: string;
  participants?: ParticipantInfo[];
  students?: Student[];
}

function VideoTile({
  label,
  videoElement,
  isLocal,
}: {
  label: string;
  videoElement: HTMLVideoElement;
  isLocal: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <div
        ref={containerRef}
        className={`w-[120px] h-[90px] bg-black/30 rounded-lg overflow-hidden [&>video]:w-full [&>video]:h-full [&>video]:object-cover [&>video]:rounded-lg ${isLocal ? '[&>video]:scale-x-[-1]' : ''}`}
      />
      <span className="text-xs text-zinc-400 truncate max-w-[120px]">
        {label}{isLocal ? ' (自分)' : ''}
      </span>
    </div>
  );
}

export default function VideoTiles({ videoElements, localIdentity, participants = [], students = [] }: VideoTilesProps) {
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
    <div className="flex flex-row gap-2 overflow-x-auto justify-center py-2 px-4">
      {sortedEntries.map(([identity, element]) => (
        <VideoTile
          key={identity}
          label={labelFor(identity)}
          videoElement={element}
          isLocal={identity === localIdentity}
        />
      ))}
    </div>
  );
}
