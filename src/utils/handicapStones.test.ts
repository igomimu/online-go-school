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

  it('19路 2子置石は右上・左下（対角）', () => {
    const stones = getHandicapStones(19, 2);
    expect(stones).toEqual(
      expect.arrayContaining([{ x: 4, y: 4 }, { x: 16, y: 16 }]),
    );
  });

  it('19路 3子置石は2子(右上・左下)+右下', () => {
    const stones = getHandicapStones(19, 3);
    expect(stones.length).toBe(3);
    expect(stones).toEqual(
      expect.arrayContaining([{ x: 4, y: 4 }, { x: 16, y: 16 }, { x: 4, y: 16 }]),
    );
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

  it('19路 6子置石は天元を使わず右辺・左辺の星で左右対称（右3・左3）', () => {
    const stones = getHandicapStones(19, 6);
    expect(stones.length).toBe(6);
    expect(stones.some(s => s.x === 10 && s.y === 10)).toBe(false); // 天元を含まない
    expect(stones.filter(s => s.x === 4).length).toBe(3);  // 右側の星列
    expect(stones.filter(s => s.x === 16).length).toBe(3); // 左側の星列
  });

  it('19路 7子置石は6子+天元', () => {
    const stones = getHandicapStones(19, 7);
    expect(stones.length).toBe(7);
    expect(stones.some(s => s.x === 10 && s.y === 10)).toBe(true);
  });

  it('19路 8子置石は天元を使わず四辺全部', () => {
    const stones = getHandicapStones(19, 8);
    expect(stones.length).toBe(8);
    expect(stones.some(s => s.x === 10 && s.y === 10)).toBe(false);
  });

  it('19路 9子置石は8子+天元', () => {
    const stones = getHandicapStones(19, 9);
    expect(stones.length).toBe(9);
    expect(stones.some(s => s.x === 10 && s.y === 10)).toBe(true);
  });
});
