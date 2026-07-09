import { describe, it, expect } from 'vitest';
import { getByoyomiAnnouncement } from './byoyomiVoice';

describe('getByoyomiAnnouncement', () => {
  describe('30秒・最後の回（periodsLeft=1）', () => {
    const f = (e: number) => getByoyomiAnnouncement(30, e, 1);
    it('10秒・20秒を読む', () => {
      expect(f(10)).toBe('10秒');
      expect(f(20)).toBe('20秒');
    });
    it('最後の10秒を1〜10で数える（30秒で「10」）', () => {
      expect(f(21)).toBe('1');
      expect(f(22)).toBe('2');
      expect(f(29)).toBe('9');
      expect(f(30)).toBe('10');
    });
    it('マーク以外は無音', () => {
      expect(f(5)).toBeNull();
      expect(f(15)).toBeNull();
    });
  });

  describe('30秒・考慮時間が残る（periodsLeft=3）', () => {
    const f = (e: number) => getByoyomiAnnouncement(30, e, 3);
    it('10,20,25,28秒を読む', () => {
      expect(f(10)).toBe('10秒');
      expect(f(20)).toBe('20秒');
      expect(f(25)).toBe('25秒');
      expect(f(28)).toBe('28秒');
    });
    it('30秒で残り回数を告げる（3-1=2）', () => {
      expect(f(30)).toBe('残り2回です');
    });
    it('最後の10秒は数えない', () => {
      expect(f(21)).toBeNull();
      expect(f(29)).toBeNull();
    });
  });

  describe('30秒・最後の考慮時間に入る（periodsLeft=2）', () => {
    it('30秒で「最後の考慮時間です」（「入りました」はTTSが誤読するため不使用）', () => {
      expect(getByoyomiAnnouncement(30, 30, 2)).toBe('最後の考慮時間です');
    });
  });

  describe('60秒・最後の回（periodsLeft=1）', () => {
    const f = (e: number) => getByoyomiAnnouncement(60, e, 1);
    it('30,40,50秒を読む（10,20は読まない）', () => {
      expect(f(10)).toBeNull();
      expect(f(20)).toBeNull();
      expect(f(30)).toBe('30秒');
      expect(f(40)).toBe('40秒');
      expect(f(50)).toBe('50秒');
    });
    it('最後の10秒を1〜10（60秒で「10」）', () => {
      expect(f(51)).toBe('1');
      expect(f(59)).toBe('9');
      expect(f(60)).toBe('10');
    });
  });

  describe('60秒・考慮時間が残る（periodsLeft=5）', () => {
    const f = (e: number) => getByoyomiAnnouncement(60, e, 5);
    it('30,40,50,55,58秒を読む', () => {
      expect(f(30)).toBe('30秒');
      expect(f(40)).toBe('40秒');
      expect(f(50)).toBe('50秒');
      expect(f(55)).toBe('55秒');
      expect(f(58)).toBe('58秒');
    });
    it('60秒で残り4回', () => {
      expect(f(60)).toBe('残り4回です');
    });
  });

  it('範囲外は null', () => {
    expect(getByoyomiAnnouncement(30, 0, 1)).toBeNull();
    expect(getByoyomiAnnouncement(30, 31, 1)).toBeNull();
    expect(getByoyomiAnnouncement(0, 5, 1)).toBeNull();
  });
});
