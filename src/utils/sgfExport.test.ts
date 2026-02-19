import { describe, it, expect } from 'vitest';
import { exportGameToSgf, todaySgfDate } from './sgfExport';

describe('exportGameToSgf', () => {
  it('基本的な対局SGFを生成', () => {
    const sgf = exportGameToSgf({
      boardSize: 19,
      handicap: 0,
      komi: 6.5,
      blackPlayer: '三村智保',
      whitePlayer: '井山裕太',
      result: 'B+R',
      moves: [
        { x: 16, y: 4, color: 'BLACK' },
        { x: 4, y: 4, color: 'WHITE' },
      ],
    });
    expect(sgf).toContain('SZ[19]');
    expect(sgf).toContain('PB[三村智保]');
    expect(sgf).toContain('PW[井山裕太]');
    expect(sgf).toContain('KM[6.5]');
    expect(sgf).toContain('RE[B+R]');
    expect(sgf).toContain(';B[pd]');
    expect(sgf).toContain(';W[dd]');
    expect(sgf).not.toContain('HA['); // handicap=0
  });

  it('置石ありの対局', () => {
    const sgf = exportGameToSgf({
      boardSize: 19,
      handicap: 2,
      komi: 0.5,
      blackPlayer: 'Black',
      whitePlayer: 'White',
      result: 'W+3.5',
      moves: [{ x: 10, y: 10, color: 'WHITE' }],
    });
    expect(sgf).toContain('HA[2]');
    expect(sgf).toContain('AB['); // 置石あり
    // 白番から始まる
    expect(sgf).toContain(';W[jj]');
  });

  it('パスを含む対局', () => {
    const sgf = exportGameToSgf({
      boardSize: 9,
      handicap: 0,
      komi: 6.5,
      blackPlayer: 'B',
      whitePlayer: 'W',
      result: '',
      moves: [
        { x: 5, y: 5, color: 'BLACK' },
        { x: 0, y: 0, color: 'WHITE' }, // パス
      ],
    });
    expect(sgf).toContain(';B[ee]');
    expect(sgf).toContain(';W[]'); // パス
  });

  it('日付付き', () => {
    const sgf = exportGameToSgf({
      boardSize: 9,
      handicap: 0,
      komi: 6.5,
      blackPlayer: 'B',
      whitePlayer: 'W',
      result: '',
      moves: [],
      date: '2026-02-20',
    });
    expect(sgf).toContain('DT[2026-02-20]');
  });
});

describe('todaySgfDate', () => {
  it('YYYY-MM-DD形式を返す', () => {
    const date = todaySgfDate();
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
