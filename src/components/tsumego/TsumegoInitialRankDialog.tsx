import { useState } from 'react';
import { TSUMEGO_START_OPTIONS, DEFAULT_START_RANK_ID } from './tsumegoStartOptions';
import { X, Play } from 'lucide-react';

interface TsumegoInitialRankDialogProps {
  onSelectInitialRank: (rankId: string) => void;
  onClose?: () => void;
}

export default function TsumegoInitialRankDialog({
  onSelectInitialRank,
  onClose,
}: TsumegoInitialRankDialogProps) {
  const [selectedRankId, setSelectedRankId] = useState<string>(DEFAULT_START_RANK_ID);

  const handleConfirm = () => {
    onSelectInitialRank(selectedRankId);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs"
      data-testid="tsumego-initial-rank-dialog"
    >
      <div className="w-full max-w-lg bg-card border rounded-2xl p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              詰碁 格付けチャレンジの開始
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              あなたの棋力に合わせて、スタートする難易度を選んでください。
            </p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
          {TSUMEGO_START_OPTIONS.map((opt) => {
            const isSelected = selectedRankId === opt.rankId;
            return (
              <div
                key={opt.rankId}
                onClick={() => setSelectedRankId(opt.rankId)}
                className={`flex items-center justify-between p-3 rounded-xl border-2 cursor-pointer transition-all ${
                  isSelected
                    ? 'border-amber-500 bg-amber-500/10 shadow-xs'
                    : 'border-border/80 hover:border-border hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl" role="img" aria-label={opt.segment}>
                    {opt.badgeEmoji}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">
                        {opt.title}
                      </span>
                      <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-semibold">
                        {opt.levelDesc}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {opt.recommendedFor}
                    </div>
                  </div>
                </div>
                <div className="w-4 h-4 rounded-full border-2 flex items-center justify-center border-amber-500">
                  {isSelected && <div className="w-2 h-2 rounded-full bg-amber-500" />}
                </div>
              </div>
            );
          })}
        </div>

        <div className="pt-2">
          <button
            onClick={handleConfirm}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-colors"
          >
            <Play className="w-4 h-4 fill-current" />
            この格からチャレンジを開始する
          </button>
        </div>
      </div>
    </div>
  );
}
