import { Trophy } from 'lucide-react';
import type { TournamentParticipant } from '../../types/tournament';

interface TournamentCelebrationProps {
  winner: TournamentParticipant;
  tournamentName: string;
  onClose: () => void;
}

/** 優勝者の発表。飾りは付けず、名前を大きく見せる */
export default function TournamentCelebration({
  winner,
  tournamentName,
  onClose,
}: TournamentCelebrationProps) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-label="優勝者">
      <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6 text-ink shadow-lg">
        <div className="flex items-center gap-2 text-sm text-muted">
          <Trophy className="h-5 w-5 text-accent-text" strokeWidth={1.5} />
          <span className="truncate">{tournamentName}</span>
        </div>
        <div className="my-5 border-y border-line py-5">
          <div className="text-xs font-semibold text-muted">優勝</div>
          <div className="mt-1 text-3xl font-bold">{winner.name}</div>
          <div className="mt-1 text-sm text-muted">{winner.rank}</div>
        </div>
        <button
          onClick={onClose}
          className="w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-ink transition-colors duration-150 hover:opacity-90"
        >
          閉じる
        </button>
      </div>
    </div>
  );
}
