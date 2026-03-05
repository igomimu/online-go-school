import { describe, it, expect } from 'vitest';
import { gradeToDisplay, rankToNumber, suggestHandicap } from './classroom';

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
