import { describe, it, expect } from 'vitest';
import {
  TSUMEGO_RANKS,
  getRankById,
  getRankIndex,
  createInitialRatingState,
  processRatingUpdate,
  pickRandomLevelForRank,
} from './tsumegoRating';

describe('tsumegoRating', () => {
  it('has exactly 28 ranks (7 segments x 4 tiers)', () => {
    expect(TSUMEGO_RANKS).toHaveLength(28);
    expect(TSUMEGO_RANKS[0].id).toBe('stone_4');
    expect(TSUMEGO_RANKS[0].name).toBe('石ころ棋士 Ⅳ');
    expect(TSUMEGO_RANKS[27].id).toBe('legend_1');
    expect(TSUMEGO_RANKS[27].name).toBe('伝説の棋士 Ⅰ');
  });

  it('correctly maps ranks and finds by ID', () => {
    const bronze3 = getRankById('bronze_3');
    expect(bronze3.name).toBe('ブロンズ棋士 Ⅲ');
    expect(bronze3.targetLevels).toContain('13K');
    expect(bronze3.canDemote).toBe(true);

    const stone4 = getRankById('stone_4');
    expect(stone4.canDemote).toBe(false);
  });

  it('promotes when reaching required points (5pt)', () => {
    let state = createInitialRatingState('bronze_4');
    expect(state.points).toBe(0);

    // 4問正解
    for (let i = 0; i < 4; i++) {
      const { nextState, event } = processRatingUpdate(state, true);
      expect(event).toBe('none');
      expect(nextState.rankId).toBe('bronze_4');
      state = nextState;
    }
    expect(state.points).toBe(4);

    // 5問目正解で昇格
    const { nextState, event } = processRatingUpdate(state, true);
    expect(event).toBe('promoted');
    expect(nextState.rankId).toBe('bronze_3');
    expect(nextState.points).toBe(0);
    expect(nextState.protectionCount).toBe(2);
    expect(nextState.totalSolved).toBe(5);
  });

  it('protects against demotion immediately after promotion', () => {
    // 昇格直後（protectionCount = 2, points = 0）
    let state = {
      ...createInitialRatingState('bronze_3'),
      points: 0,
      protectionCount: 2,
    };

    // 1回目のミス: 保護でランク維持＆ポイント据え置き、保護残り1
    let result = processRatingUpdate(state, false);
    expect(result.event).toBe('none');
    expect(result.nextState.rankId).toBe('bronze_3');
    expect(result.nextState.protectionCount).toBe(1);
    expect(result.nextState.points).toBe(0);

    // 2回目のミス: 保護でランク維持、保護残り0
    result = processRatingUpdate(result.nextState, false);
    expect(result.event).toBe('none');
    expect(result.nextState.rankId).toBe('bronze_3');
    expect(result.nextState.protectionCount).toBe(0);

    // 3回目のミス: 保護が切れたため降格
    result = processRatingUpdate(result.nextState, false);
    expect(result.event).toBe('demoted');
    expect(result.nextState.rankId).toBe('bronze_4');
    expect(result.nextState.points).toBe(4); // 降格直後は4pt（あと1問で再昇格）
  });

  it('does not demote stone rank (beginner protection)', () => {
    let state = createInitialRatingState('stone_4');
    // 何度ミスしても降格しない
    for (let i = 0; i < 5; i++) {
      const { nextState, event } = processRatingUpdate(state, false);
      expect(event).toBe('none');
      expect(nextState.rankId).toBe('stone_4');
      expect(nextState.points).toBe(0);
      state = nextState;
    }
  });

  it('selects valid problem level for rank', () => {
    const silverLevel = pickRandomLevelForRank('silver_1');
    expect(silverLevel).toBe('5K');

    const bronzeLevel = pickRandomLevelForRank('bronze_1');
    expect(['11K', '10K']).toContain(bronzeLevel);
  });
});
