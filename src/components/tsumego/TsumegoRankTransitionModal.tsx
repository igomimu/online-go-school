import { useEffect } from 'react';
import { getRankById } from '../../utils/tsumegoRating';
import { Trophy, TrendingDown, ArrowUpRight } from 'lucide-react';

interface TsumegoRankTransitionModalProps {
  event: 'promoted' | 'demoted';
  previousRankId: string;
  newRankId: string;
  onClose: () => void;
}

export default function TsumegoRankTransitionModal({
  event,
  previousRankId,
  newRankId,
  onClose,
}: TsumegoRankTransitionModalProps) {
  const prevRank = getRankById(previousRankId);
  const newRank = getRankById(newRankId);
  const isPromotion = event === 'promoted';

  // 3秒後に自動クローズ
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 3200);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
      data-testid="tsumego-rank-transition-modal"
    >
      <div
        className={`w-full max-w-sm rounded-2xl p-6 text-center shadow-2xl border-2 transform animate-in zoom-in-95 duration-300 ${
          isPromotion
            ? 'bg-card border-amber-400 dark:border-amber-500'
            : 'bg-card border-slate-400 dark:border-slate-600'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {isPromotion ? (
          <>
            <div className="mx-auto w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950/60 flex items-center justify-center text-3xl mb-3 shadow-inner">
              <Trophy className="w-9 h-9 text-amber-500 animate-bounce" />
            </div>
            <div className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50 px-2.5 py-1 rounded-full mb-2">
              <ArrowUpRight className="w-3.5 h-3.5" /> 昇格おめでとう！
            </div>
            <h3 className="text-xl font-extrabold text-foreground mb-1">
              {newRank.name}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              {prevRank.name} から昇格しました！
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-3xl mb-3">
              <TrendingDown className="w-8 h-8 text-slate-500" />
            </div>
            <div className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full mb-2">
              格付け変動
            </div>
            <h3 className="text-lg font-bold text-foreground mb-1">
              {newRank.name}
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              次は正解を重ねて再昇格を目指しましょう！
            </p>
          </>
        )}

        <button
          onClick={onClose}
          className={`w-full py-2.5 px-4 rounded-xl font-bold text-sm transition-colors shadow-md ${
            isPromotion
              ? 'bg-amber-500 hover:bg-amber-600 text-white'
              : 'bg-primary hover:bg-primary/90 text-primary-foreground'
          }`}
        >
          次の問題へ進む
        </button>
      </div>
    </div>
  );
}
