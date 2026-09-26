import type { TsumegoRatingState } from '../../types/tsumegoRating';
import { getRankById } from '../../utils/tsumegoRating';

interface TsumegoRatingBadgeProps {
  state?: TsumegoRatingState | null;
  rankId?: string;
  className?: string;
  showPoints?: boolean;
}

export default function TsumegoRatingBadge({
  state,
  rankId,
  className = '',
  showPoints = false,
}: TsumegoRatingBadgeProps) {
  const targetRankId = rankId ?? state?.rankId ?? 'stone_4';
  const rank = getRankById(targetRankId);

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold shadow-sm border ${
        rank.segment === '石ころ棋士'
          ? 'bg-stone-100 text-stone-700 border-stone-300'
          : rank.segment === 'ブロンズ棋士'
          ? 'bg-amber-50 text-amber-800 border-amber-300'
          : rank.segment === 'シルバー棋士'
          ? 'bg-slate-100 text-slate-700 border-slate-300'
          : rank.segment === 'ゴールド棋士'
          ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
          : rank.segment === 'ダイヤの棋士'
          ? 'bg-cyan-50 text-cyan-800 border-cyan-300'
          : rank.segment === '光の棋士'
          ? 'bg-indigo-50 text-indigo-800 border-indigo-300'
          : 'bg-purple-100 text-purple-900 border-purple-400'
      } ${className}`}
      data-testid="tsumego-rating-badge"
    >
      <span className="text-sm">{rank.badgeEmoji}</span>
      <span>{rank.name}</span>
      {showPoints && state && (
        <span className="text-[10px] text-muted-foreground ml-0.5">
          ({state.points}/{rank.pointsToPromote}pt)
        </span>
      )}
    </div>
  );
}
