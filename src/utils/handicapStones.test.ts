import { describe, it, expect } from 'vitest';
import { getHandicapStones } from './handicapStones';

describe('getHandicapStones', () => {
  it('handicap=0 は空配列', () => {
    expect(getHandicapStones(19, 0)).toEqual([]);
  });

  it('handicap=1 は空配列', () => {
    expect(getHandicapStones(19, 1)).toEqual([]);
  });

  it('19路 2子置石', () => {
    const stones = getHandicapStones(19, 2);
    expect(stones.length).toBe(2);
    // 全て星の位置（4, 10, 16）にあること
    stones.forEach(s => {
      expect([4, 10, 16]).toContain(s.x);
      expect([4, 10, 16]).toContain(s.y);
    });
  });

  it('19路 9子置石', () => {
    const stones = getHandicapStones(19, 9);
    expect(stones.length).toBe(9);
    // 天元(10,10)を含む
    expect(stones.some(s => s.x === 10 && s.y === 10)).toBe(true);
  });

  it('13路 5子置石', () => {
    const stones = getHandicapStones(13, 5);
    expect(stones.length).toBe(5);
    // 天元(7,7)を含む
    expect(stones.some(s => s.x === 7 && s.y === 7)).toBe(true);
  });

  it('9路 4子置石', () => {
    const stones = getHandicapStones(9, 4);
    expect(stones.length).toBe(4);
    // 全て星の位置（3, 5, 7）にあること
    stones.forEach(s => {
      expect([3, 5, 7]).toContain(s.x);
      expect([3, 5, 7]).toContain(s.y);
    });
  });

  it('未対応の盤面サイズは空配列', () => {
    expect(getHandicapStones(7, 2)).toEqual([]);
    expect(getHandicapStones(15, 2)).toEqual([]);
  });
});
