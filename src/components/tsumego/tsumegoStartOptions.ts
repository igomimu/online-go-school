import type { TsumegoSegment } from '../../types/tsumegoRating';

/** 格付けを始める格の候補。各区分のⅣから始める */
export const TSUMEGO_START_OPTIONS: {
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

export const DEFAULT_START_RANK_ID = 'bronze_4';
