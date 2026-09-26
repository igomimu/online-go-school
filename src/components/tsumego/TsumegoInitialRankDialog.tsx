import { useState } from 'react';
import type { TsumegoSegment } from '../../types/tsumegoRating';
import { X, Play } from 'lucide-react';

interface TsumegoInitialRankDialogProps {
  onSelectInitialRank: (rankId: string) => void;
  onClose?: () => void;
}

const START_SEGMENT_OPTIONS: {
  segment: TsumegoSegment;
  rankId: string;
  badgeEmoji: string;
  title: string;
  levelDesc: string;
  recommendedFor: string;
}[] = [
  {
    segment: '石ころ棋士',
    rankId: 'stone_4',
    badgeEmoji: '🪨',
    title: '石ころ棋士 Ⅳ',
    levelDesc: '15級レベル',
    recommendedFor: '入門・囲碁を始めたばかりの方',
  },
  {
    segment: 'ブロンズ棋士',
    rankId: 'bronze_4',
    badgeEmoji: '🥉',
    title: 'ブロンズ棋士 Ⅳ',
    levelDesc: '14級〜10級レベル',
    recommendedFor: '初級・基本の一手死活を練習したい方',
  },
  {
    segment: 'シルバー棋士',
    rankId: 'silver_4',
    badgeEmoji: '🥈',
    title: 'シルバー棋士 Ⅳ',
    levelDesc: '9級〜5級レベル',
    recommendedFor: '中級・一手一手深く読みたい方',
  },
  {
    segment: 'ゴールド棋士',
    rankId: 'gold_4',
    badgeEmoji: '🥇',
    title: 'ゴールド棋士 Ⅳ',
    levelDesc: '4級〜初段レベル',
    recommendedFor: '上級〜初段・手筋や急所を身につけたい方',
  },
  {
    segment: 'ダイヤの棋士',
    rankId: 'diamond_4',
    badgeEmoji: '💎',
    title: 'ダイヤの棋士 Ⅳ',
    levelDesc: '二段〜三段レベル',
    recommendedFor: '有段者・本格的な詰碁に挑戦したい方',
  },
  {
    segment: '光の棋士',
    rankId: 'light_4',
    badgeEmoji: '✨',
    title: '光の棋士 Ⅳ',
    levelDesc: '四段〜五段レベル',
    recommendedFor: '高段者・難問で読みを鍛えたい方',
  },
  {
    segment: '伝説の棋士',
    rankId: 'legend_4',
    badgeEmoji: '👑',
    title: '伝説の棋士 Ⅳ',
    levelDesc: '六段〜七段レベル',
    recommendedFor: '最上位・道場トップクラスの実力者向け',
  },
];

export default function TsumegoInitialRankDialog({
  onSelectInitialRank,
  onClose,
}: TsumegoInitialRankDialogProps) {
  const [selectedRankId, setSelectedRankId] = useState<string>('bronze_4');

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
          {START_SEGMENT_OPTIONS.map((opt) => {
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
