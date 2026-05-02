import { describe, it, expect } from 'vitest';
import { calcGrade, currentSchoolYear, resolveGrade } from './gradeCalc';

describe('currentSchoolYear', () => {
  it('3月末は前年度扱い', () => {
    expect(currentSchoolYear(new Date(2026, 2, 31))).toBe(2025); // 2026-03-31
  });
  it('4/1は新年度', () => {
    expect(currentSchoolYear(new Date(2026, 3, 1))).toBe(2026); // 2026-04-01
  });
  it('年末は当年度', () => {
    expect(currentSchoolYear(new Date(2026, 11, 31))).toBe(2026);
  });
});

describe('calcGrade (基準日 2026-04-21)', () => {
  const today = new Date(2026, 3, 21);

  it('2019-04-02 遅生まれ → 小1', () => {
    expect(calcGrade('2019-04-02', today)).toBe('小1');
  });
  it('2020-04-01 早生まれ → 小1', () => {
    expect(calcGrade('2020-04-01', today)).toBe('小1');
  });
  it('2020-04-02 遅生まれ → 未就学 ("")', () => {
    expect(calcGrade('2020-04-02', today)).toBe('');
  });
  it('2019-04-01 早生まれ → 小2', () => {
    expect(calcGrade('2019-04-01', today)).toBe('小2');
  });
  it('2014-05-15 → 小6', () => {
    expect(calcGrade('2014-05-15', today)).toBe('小6');
  });
  it('2014-04-01 早生まれ → 中1', () => {
    expect(calcGrade('2014-04-01', today)).toBe('中1');
  });
  it('2013-09-01 → 中1', () => {
    expect(calcGrade('2013-09-01', today)).toBe('中1');
  });
  it('2011-06-10 → 中3', () => {
    expect(calcGrade('2011-06-10', today)).toBe('中3');
  });
  it('2008-12-01 → 高3', () => {
    expect(calcGrade('2008-12-01', today)).toBe('高3');
  });
  it('2007-05-01 → 大学', () => {
    expect(calcGrade('2007-05-01', today)).toBe('大学');
  });
  it('1980-01-01 → 大人', () => {
    expect(calcGrade('1980-01-01', today)).toBe('大人');
  });
  it('空文字 → 空', () => {
    expect(calcGrade('', today)).toBe('');
  });
  it('不正形式 → 空', () => {
    expect(calcGrade('2020/04/01', today)).toBe('');
  });
  it('月が範囲外 → 空', () => {
    expect(calcGrade('2020-13-01', today)).toBe('');
  });
});

describe('calcGrade (年度境目の挙動)', () => {
  it('3/31時点ではまだ前年度: 2020-04-01 早生まれは年長扱い', () => {
    // 2026-03-31 は 2025年度末。2020-04-01 生まれは 2025年度は 5歳→年長
    expect(calcGrade('2020-04-01', new Date(2026, 2, 31))).toBe('');
  });
  it('4/1時点で新年度: 2020-04-01 早生まれは小1', () => {
    expect(calcGrade('2020-04-01', new Date(2026, 3, 1))).toBe('小1');
  });
});

describe('resolveGrade', () => {
  const today = new Date(2026, 3, 21);

  it('birthdate 有効なら自動計算', () => {
    expect(resolveGrade('2014-05-15', '小5', today)).toBe('小6');
  });
  it('birthdate 無しなら手入力 grade', () => {
    expect(resolveGrade(undefined, '小5', today)).toBe('小5');
  });
  it('両方とも無しなら空', () => {
    expect(resolveGrade(undefined, '', today)).toBe('');
  });
  it('birthdate 不正でも手入力にフォールバック', () => {
    expect(resolveGrade('invalid', '中1', today)).toBe('中1');
  });
});
