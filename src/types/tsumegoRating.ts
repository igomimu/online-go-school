/**
 * 詰碁の格付けシステム（全28段階）
 * セグメント（道場アプリ共通の7区分）× 階級（Ⅳ〜Ⅰ）
 */

export type TsumegoSegment =
  | '石ころ棋士'
  | 'ブロンズ棋士'
  | 'シルバー棋士'
  | 'ゴールド棋士'
  | 'ダイヤの棋士'
  | '光の棋士'
  | '伝説の棋士';

export type TsumegoTier = 'Ⅳ' | 'Ⅲ' | 'Ⅱ' | 'Ⅰ';

export interface TsumegoRankDefinition {
  id: string;                      // 例: 'stone_4', 'bronze_3'
  segment: TsumegoSegment;
  tier: TsumegoTier;
  name: string;                    // 例: '石ころ棋士 Ⅳ', 'ブロンズ棋士 Ⅲ'
  badgeEmoji: string;              // 例: '🪨', '🥉'
  targetLevels: string[];          // 出題対象の難易度（例: ['14K', '14K+']）
  pointsToPromote: number;         // 昇格に必要な勝ち点（規定: 5pt）
  canDemote: boolean;              // 降格があるか（石ころ棋士はfalse）
}

export interface TsumegoRatingState {
  rankId: string;                  // 現在のランクID
  points: number;                  // 現在の勝ち点（0 〜 pointsToPromote）
  consecutiveWins: number;         // 連勝数
  protectionCount: number;         // 昇格直後の降格保護残り回数（2回）
  totalSolved: number;             // 累計正解数
  totalAttempts: number;           // 累計挑戦数
  highestRankId: string;           // 過去最高ランクID
  lastUpdated: string;             // ISO日時
}

export interface RatingUpdateResult {
  nextState: TsumegoRatingState;
  event: 'none' | 'promoted' | 'demoted';
  previousRankId: string;
}
