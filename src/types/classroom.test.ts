import { describe, it, expect } from 'vitest';
import {
  gradeToDisplay,
  rankToNumber,
  suggestHandicap,
  RANK_OPTIONS,
  RATING_OPTIONS,
  normalizeRank,
  ratingToNumber,
  displayRank,
} from './classroom';

describe('gradeToDisplay', () => {
  it('小学生', () => {
    expect(gradeToDisplay(1)).toBe('小1');
    expect(gradeToDisplay(6)).toBe('小6');
  });
  it('中学生', () => {
    expect(gradeToDisplay(7)).toBe('中1');
    expect(gradeToDisplay(9)).toBe('中3');
  });
  it('高校生', () => {
    expect(gradeToDisplay(10)).toBe('高1');
    expect(gradeToDisplay(12)).toBe('高3');
  });
  it('大学', () => {
    expect(gradeToDisplay(13)).toBe('大学');
  });
  it('大人', () => {
    expect(gradeToDisplay(16)).toBe('大人');
  });
  it('未設定', () => {
    expect(gradeToDisplay(0)).toBe('');
    expect(gradeToDisplay(-1)).toBe('');
  });
});

describe('rankToNumber', () => {
  it('段位', () => {
    expect(rankToNumber('1D')).toBe(1);
    expect(rankToNumber('9D')).toBe(9);
  });
  it('プロ段位', () => {
    expect(rankToNumber('9P')).toBe(9);
  });
  it('級位', () => {
    expect(rankToNumber('1K')).toBe(0);
    expect(rankToNumber('2K')).toBe(-1);
    expect(rankToNumber('10K')).toBe(-9);
  });
  it('未設定', () => {
    expect(rankToNumber('')).toBe(-99);
    expect(rankToNumber('invalid')).toBe(-99);
  });
});

describe('suggestHandicap', () => {
  it('同棋力はハンデなし', () => {
    expect(suggestHandicap('3D', '3D')).toEqual({ handicap: 0, komi: 6.5 });
  });
  it('1目差はコミなし', () => {
    expect(suggestHandicap('2D', '3D')).toEqual({ handicap: 0, komi: 0.5 });
  });
  it('2目差は2子', () => {
    expect(suggestHandicap('1D', '3D')).toEqual({ handicap: 2, komi: 0.5 });
  });
  it('黒が強い場合はハンデなし', () => {
    expect(suggestHandicap('5D', '3D')).toEqual({ handicap: 0, komi: 6.5 });
  });
  it('大差は最大9子', () => {
    expect(suggestHandicap('10K', '5D')).toEqual({ handicap: 9, komi: 0.5 });
  });
  it('片方未設定はハンデなし', () => {
    expect(suggestHandicap('', '3D')).toEqual({ handicap: 0, komi: 6.5 });
  });
});

// 2026-08-13 三村さん: 段級は日本語（30級〜初段〜八段）、ランクは R60〜R0。
// 表示方法は教室ごとに選ぶ。
describe('棋力の表記', () => {
  it('段級の選択肢は八段から30級まで', () => {
    expect(RANK_OPTIONS[0]).toBe('八段');
    expect(RANK_OPTIONS[7]).toBe('初段');
    expect(RANK_OPTIONS[8]).toBe('1級');
    expect(RANK_OPTIONS[RANK_OPTIONS.length - 1]).toBe('30級');
    expect(RANK_OPTIONS).toHaveLength(38);
  });

  it('ランクの選択肢は R0 から R60 まで', () => {
    expect(RATING_OPTIONS[0]).toBe('R0');
    expect(RATING_OPTIONS[RATING_OPTIONS.length - 1]).toBe('R60');
    expect(RATING_OPTIONS).toHaveLength(61);
  });

  it('旧データの英字表記を日本語に読み替える', () => {
    expect(normalizeRank('1D')).toBe('初段');
    expect(normalizeRank('4D')).toBe('四段');
    expect(normalizeRank('8D')).toBe('八段');
    expect(normalizeRank('3K')).toBe('3級');
    expect(normalizeRank('30K')).toBe('30級');
  });

  it('すでに日本語ならそのまま', () => {
    expect(normalizeRank('初段')).toBe('初段');
    expect(normalizeRank('12級')).toBe('12級');
    expect(normalizeRank('')).toBe('');
  });

  it('段級を強さの数値にする（日本語・英字どちらでも）', () => {
    expect(rankToNumber('初段')).toBe(1);
    expect(rankToNumber('1D')).toBe(1);
    expect(rankToNumber('八段')).toBe(8);
    expect(rankToNumber('1級')).toBe(0);
    expect(rankToNumber('3級')).toBe(-2);
    expect(rankToNumber('3K')).toBe(-2);
    expect(rankToNumber('')).toBe(-99);
  });

  it('ランクは0が最強なので、強い順に並ぶ数値へ反転する', () => {
    expect(ratingToNumber('R0')).toBeGreaterThan(ratingToNumber('R12'));
    expect(ratingToNumber('R12')).toBeGreaterThan(ratingToNumber('R60'));
    expect(ratingToNumber('12')).toBe(ratingToNumber('R12'));
    expect(ratingToNumber('')).toBe(-99);
  });

  it('置き石の提案は日本語表記でも英字と同じ結果になる', () => {
    expect(suggestHandicap('5級', '初段')).toEqual(suggestHandicap('5K', '1D'));
  });

  it('教室の設定に応じて段級かランクを出す', () => {
    const student = { rank: '3K', internalRating: 'R12' };
    expect(displayRank(student, 'dan_kyu')).toBe('3級');
    expect(displayRank(student, 'rating')).toBe('R12');
  });

  it('選ばれた側が空なら、もう片方で埋める', () => {
    expect(displayRank({ rank: '', internalRating: 'R6' }, 'dan_kyu')).toBe('R6');
    expect(displayRank({ rank: '2D', internalRating: '' }, 'rating')).toBe('二段');
    expect(displayRank({ rank: '', internalRating: '' }, 'rating')).toBe('');
  });
});
