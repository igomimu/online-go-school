import type {
  TsumegoSegment,
  TsumegoTier,
  TsumegoRankDefinition,
  TsumegoRatingState,
  RatingUpdateResult,
} from '../types/tsumegoRating';

export const POINTS_TO_PROMOTE_DEFAULT = 5;
export const PROMOTION_PROTECTION_ROUNDS = 2;

const SEGMENT_CONFIGS: {
  segment: TsumegoSegment;
  badgeEmoji: string;
  canDemote: boolean;
  tierLevels: Record<TsumegoTier, string[]>;
}[] = [
  {
    segment: '石ころ棋士',
    badgeEmoji: '🪨',
    canDemote: false,
    tierLevels: {
      'Ⅳ': ['15K'],
      'Ⅲ': ['15K'],
      'Ⅱ': ['15K'],
      'Ⅰ': ['15K'],
    },
  },
  {
    segment: 'ブロンズ棋士',
    badgeEmoji: '🥉',
    canDemote: true,
    tierLevels: {
      'Ⅳ': ['14K'],
      'Ⅲ': ['13K'],
      'Ⅱ': ['12K'],
      'Ⅰ': ['11K', '10K'],
    },
  },
  {
    segment: 'シルバー棋士',
    badgeEmoji: '🥈',
    canDemote: true,
    tierLevels: {
      'Ⅳ': ['9K', '8K'],
      'Ⅲ': ['7K'],
      'Ⅱ': ['6K'],
      'Ⅰ': ['5K'],
    },
  },
  {
    segment: 'ゴールド棋士',
    badgeEmoji: '🥇',
    canDemote: true,
    tierLevels: {
      'Ⅳ': ['4K'],
      'Ⅲ': ['3K', '2K'],
      'Ⅱ': ['1K'],
      'Ⅰ': ['1D'],
    },
  },
  {
    segment: 'ダイヤの棋士',
    badgeEmoji: '💎',
    canDemote: true,
    tierLevels: {
      'Ⅳ': ['2D'],
      'Ⅲ': ['2D'],
      'Ⅱ': ['3D'],
      'Ⅰ': ['3D'],
    },
  },
  {
    segment: '光の棋士',
    badgeEmoji: '✨',
    canDemote: true,
    tierLevels: {
      'Ⅳ': ['4D'],
      'Ⅲ': ['4D'],
      'Ⅱ': ['5D'],
      'Ⅰ': ['5D'],
    },
  },
  {
    segment: '伝説の棋士',
    badgeEmoji: '👑',
    canDemote: true,
    tierLevels: {
      'Ⅳ': ['6D'],
      'Ⅲ': ['6D'],
      'Ⅱ': ['7D'],
      'Ⅰ': ['7D'],
    },
  },
];

const TIERS: TsumegoTier[] = ['Ⅳ', 'Ⅲ', 'Ⅱ', 'Ⅰ'];

function buildSegmentPrefix(segment: TsumegoSegment): string {
  switch (segment) {
    case '石ころ棋士': return 'stone';
    case 'ブロンズ棋士': return 'bronze';
    case 'シルバー棋士': return 'silver';
    case 'ゴールド棋士': return 'gold';
    case 'ダイヤの棋士': return 'diamond';
    case '光の棋士': return 'light';
    case '伝説の棋士': return 'legend';
  }
}

function tierToNum(tier: TsumegoTier): number {
  switch (tier) {
    case 'Ⅳ': return 4;
    case 'Ⅲ': return 3;
    case 'Ⅱ': return 2;
    case 'Ⅰ': return 1;
  }
}

/** 全28段階のランク定義（下から上への昇順） */
export const TSUMEGO_RANKS: TsumegoRankDefinition[] = SEGMENT_CONFIGS.flatMap((cfg) =>
  TIERS.map((tier) => ({
    id: `${buildSegmentPrefix(cfg.segment)}_${tierToNum(tier)}`,
    segment: cfg.segment,
    tier,
    name: `${cfg.segment} ${tier}`,
    badgeEmoji: cfg.badgeEmoji,
    targetLevels: cfg.tierLevels[tier],
    pointsToPromote: POINTS_TO_PROMOTE_DEFAULT,
    canDemote: cfg.canDemote,
  }))
);

const rankIndexMap = new Map<string, number>();
TSUMEGO_RANKS.forEach((rank, idx) => {
  rankIndexMap.set(rank.id, idx);
});

export function getRankById(rankId: string): TsumegoRankDefinition {
  const index = rankIndexMap.get(rankId);
  return index !== undefined ? TSUMEGO_RANKS[index] : TSUMEGO_RANKS[0];
}

export function getRankIndex(rankId: string): number {
  return rankIndexMap.get(rankId) ?? 0;
}

export function createInitialRatingState(initialRankId = 'stone_4'): TsumegoRatingState {
  const rank = getRankById(initialRankId);
  return {
    rankId: rank.id,
    points: 0,
    consecutiveWins: 0,
    protectionCount: 0,
    totalSolved: 0,
    totalAttempts: 0,
    highestRankId: rank.id,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * 解答結果（正解/不正解）を反映して新しい格付け状態を計算する。
 */
export function processRatingUpdate(
  current: TsumegoRatingState,
  isCorrect: boolean
): RatingUpdateResult {
  const currentIndex = getRankIndex(current.rankId);
  const currentRank = TSUMEGO_RANKS[currentIndex];
  const previousRankId = current.rankId;

  let newPoints = current.points;
  let newRankId = current.rankId;
  let newProtectionCount = current.protectionCount;
  let newConsecutiveWins = current.consecutiveWins;
  let event: 'none' | 'promoted' | 'demoted' = 'none';

  if (isCorrect) {
    newConsecutiveWins += 1;
    newPoints += 1;

    // 昇格判定
    if (newPoints >= currentRank.pointsToPromote) {
      if (currentIndex < TSUMEGO_RANKS.length - 1) {
        // 次のランクへ昇格
        const nextRank = TSUMEGO_RANKS[currentIndex + 1];
        newRankId = nextRank.id;
        newPoints = 0;
        newProtectionCount = PROMOTION_PROTECTION_ROUNDS;
        event = 'promoted';
      } else {
        // 最上位（伝説の棋士Ⅰ）カンスト
        newPoints = currentRank.pointsToPromote;
      }
    }
  } else {
    // 不正解
    newConsecutiveWins = 0;

    if (newProtectionCount > 0) {
      // 昇格保護でポイント減少を防ぐ（保護消費）
      newProtectionCount -= 1;
    } else {
      if (newPoints > 0) {
        newPoints -= 1;
      } else if (currentRank.canDemote && currentIndex > 0) {
        // 0ptでミスし、かつ降格可能なら1つ下のランクへ降格
        const prevRank = TSUMEGO_RANKS[currentIndex - 1];
        newRankId = prevRank.id;
        // 降格直後はあと1問正解で再昇格できる位置（pointsToPromote - 1）にセット
        newPoints = Math.max(0, prevRank.pointsToPromote - 1);
        event = 'demoted';
      }
    }
  }

  // 過去最高ランクの更新
  const newIndex = getRankIndex(newRankId);
  const highestIndex = getRankIndex(current.highestRankId);
  const highestRankId = newIndex > highestIndex ? newRankId : current.highestRankId;

  const nextState: TsumegoRatingState = {
    rankId: newRankId,
    points: newPoints,
    consecutiveWins: newConsecutiveWins,
    protectionCount: newProtectionCount,
    totalSolved: current.totalSolved + (isCorrect ? 1 : 0),
    totalAttempts: current.totalAttempts + 1,
    highestRankId,
    lastUpdated: new Date().toISOString(),
  };

  return { nextState, event, previousRankId };
}

/** そのランクで出題する詰碁難易度レベルをランダムに1つ選ぶ */
export function pickRandomLevelForRank(rankId: string): string {
  const rank = getRankById(rankId);
  const levels = rank.targetLevels;
  const picked = levels[Math.floor(Math.random() * levels.length)];
  return picked;
}

const STORAGE_KEY_PREFIX = 'online_go_school_tsumego_rating_';

export function loadTsumegoRatingFromStorage(studentId?: string): TsumegoRatingState | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  const key = `${STORAGE_KEY_PREFIX}${studentId || 'guest'}`;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as TsumegoRatingState;
  } catch {
    return null;
  }
}

export function saveTsumegoRatingToStorage(state: TsumegoRatingState, studentId?: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const key = `${STORAGE_KEY_PREFIX}${studentId || 'guest'}`;
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save tsumego rating to storage:', err);
  }
}
