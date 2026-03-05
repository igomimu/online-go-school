import { useEffect, useRef } from 'react';

interface VideoTilesProps {
  videoElements: Map<string, HTMLVideoElement>;
  localIdentity: string;
}

function VideoTile({
  identity,
  videoElement,
  isLocal,
}: {
  identity: string;
  videoElement: HTMLVideoElement;
  isLocal: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !videoElement) return;

    // スタイル設定
    videoElement.style.width = '100%';
    videoElement.style.height = '100%';
    videoElement.style.objectFit = 'cover';
    videoElement.style.borderRadius = '0.5rem';
    if (isLocal) {
      videoElement.style.transform = 'scaleX(-1)';
    }

    container.appendChild(videoElement);

    return () => {
      if (container.contains(videoElement)) {
        container.removeChild(videoElement);
      }
    };
  }, [videoElement, isLocal]);

  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <div
        ref={containerRef}
        className="w-[120px] h-[90px] bg-black/30 rounded-lg overflow-hidden"
      />
      <span className="text-xs text-zinc-400 truncate max-w-[120px]">
        {identity}{isLocal ? ' (自分)' : ''}
      </span>
    </div>
  );
}

export default function VideoTiles({ videoElements, localIdentity }: VideoTilesProps) {
  if (videoElements.size === 0) return null;

  // ローカルを先頭に表示
  const sortedEntries = Array.from(videoElements.entries()).sort(([a], [b]) => {
    if (a === localIdentity) return -1;
    if (b === localIdentity) return 1;
    return a.localeCompare(b);
  });

  return (
    <div className="flex flex-row gap-2 overflow-x-auto justify-center py-2 px-4">
      {sortedEntries.map(([identity, element]) => (
        <VideoTile
          key={identity}
          identity={identity}
          videoElement={element}
          isLocal={identity === localIdentity}
        />
      ))}
    </div>
  );
}
