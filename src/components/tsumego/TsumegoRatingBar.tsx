import type { TsumegoRatingState } from '../../types/tsumegoRating';
import { getRankById } from '../../utils/tsumegoRating';
import { Shield, Flame } from 'lucide-react';

interface TsumegoRatingBarProps {
  state: TsumegoRatingState;
  className?: string;
}

export default function TsumegoRatingBar({ state, className = '' }: TsumegoRatingBarProps) {
  const rank = getRankById(state.rankId);
  const totalSlots = rank.pointsToPromote;

  return (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 bg-card border rounded-lg px-3 py-2 shadow-sm ${className}`}
      data-testid="tsumego-rating-bar"
    >
      {/* ランク名とアイコン */}
      <div className="flex items-center gap-2">
        <span className="text-xl" role="img" aria-label={rank.segment}>
          {rank.badgeEmoji}
        </span>
        <div>
          <div className="flex items-center gap-1.5 font-bold text-sm leading-tight text-foreground">
            <span>{rank.name}</span>
            {state.protectionCount > 0 && (
              <span
                className="inline-flex items-center gap-0.5 text-xs text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-1.5 py-0.5 rounded"
                title={`昇格保護中（あと${state.protectionCount}回ミスしても降格しません）`}
              >
                <Shield className="w-3 h-3" />
                <span className="text-[10px]">保護{state.protectionCount}</span>
              </span>
            )}
            {state.consecutiveWins >= 2 && (
              <span
                className="inline-flex items-center gap-0.5 text-xs text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/50 px-1.5 py-0.5 rounded"
                title={`${state.consecutiveWins}連勝中！`}
              >
                <Flame className="w-3 h-3 text-orange-500 fill-orange-500" />
                <span className="text-[10px] font-bold">{state.consecutiveWins}連勝</span>
              </span>
            )}
          </div>
          <div className="text-[11px] text-muted-foreground">
            出題レベル: {rank.targetLevels.join(', ')}
          </div>
        </div>
      </div>

      {/* 昇格ゲージ */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1">
          {Array.from({ length: totalSlots }).map((_, i) => {
            const isFilled = i < state.points;
            return (
              <div
                key={i}
                className={`w-5 h-2.5 rounded-sm transition-all duration-300 ${
                  isFilled
                    ? 'bg-amber-500 shadow-sm scale-105'
                    : 'bg-muted border border-border/60'
                }`}
                title={`勝ち点: ${state.points} / ${totalSlots}`}
              />
            );
          })}
        </div>
        <span className="text-xs font-mono font-medium text-muted-foreground ml-1">
          {state.points}/{totalSlots} pt
        </span>
      </div>
    </div>
  );
}
