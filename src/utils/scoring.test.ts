import { describe, it, expect } from 'vitest';
import { calculateTerritory, formatScoringResult, formatScoringResultJa, formatGameResultMessage, timedOutColorFromResult, isTimeoutResult, formatResultSpeech } from './scoring';
import type { BoardState, Stone } from '../components/GoBoard';

function makeBoard(size: number, stones: { x: number; y: number; color: 'BLACK' | 'WHITE' }[]): BoardState {
  const board: BoardState = Array.from({ length: size }, () => Array(size).fill(null));
  for (const s of stones) {
    board[s.y - 1][s.x - 1] = { color: s.color } as Stone;
  }
  return board;
}

describe('calculateTerritory', () => {
  it('空盤はダメ（どちらの地でもない）', () => {
    const board = makeBoard(9, []);
    const result = calculateTerritory(board, 9, new Set(), 0, 0, 6.5);
    expect(result.blackTerritory).toBe(0);
    expect(result.whiteTerritory).toBe(0);
  });

  it('全面黒石で囲まれた空き地は黒の地', () => {
    // 5x5 board with black stones on the border, inside is empty
    const stones: { x: number; y: number; color: 'BLACK' | 'WHITE' }[] = [];
    for (let i = 1; i <= 5; i++) {
      stones.push({ x: i, y: 1, color: 'BLACK' });
      stones.push({ x: i, y: 5, color: 'BLACK' });
      if (i > 1 && i < 5) {
        stones.push({ x: 1, y: i, color: 'BLACK' });
        stones.push({ x: 5, y: i, color: 'BLACK' });
      }
    }
    const board = makeBoard(5, stones);
    const result = calculateTerritory(board, 5, new Set(), 0, 0, 6.5);
    // Inner 3x3 = 9 points of black territory
    expect(result.blackTerritory).toBe(9);
    expect(result.whiteTerritory).toBe(0);
  });

  it('死石をマークすると地に変わる', () => {
    // 9x9 board: left half black, right half white, one white stone inside black territory
    const stones: { x: number; y: number; color: 'BLACK' | 'WHITE' }[] = [];
    // Black wall on column 5
    for (let y = 1; y <= 9; y++) {
      stones.push({ x: 5, y, color: 'BLACK' });
    }
    // A single white stone at (3,5) inside black territory
    stones.push({ x: 3, y: 5, color: 'WHITE' });

    const board = makeBoard(9, stones);

    // Without dead stones: region around (3,5) is mixed (both colors border it)
    const resultNoDead = calculateTerritory(board, 9, new Set(), 0, 0, 6.5);

    // Mark white stone as dead
    const deadStones = new Set(['3,5']);
    const resultWithDead = calculateTerritory(board, 9, deadStones, 0, 0, 6.5);

    // With dead stone removed, left side should be more black territory
    expect(resultWithDead.blackTerritory).toBeGreaterThan(resultNoDead.blackTerritory);
    expect(resultWithDead.deadWhiteStones).toBe(1);
  });

  it('日本ルール: 地 + アゲハマ + 死石 + コミ', () => {
    const board = makeBoard(9, []);
    // Empty board, no territory for either side
    const result = calculateTerritory(board, 9, new Set(), 5, 3, 6.5);
    expect(result.blackTotal).toBe(0 + 5); // territory(0) + captures(5)
    expect(result.whiteTotal).toBe(0 + 3 + 6.5); // territory(0) + captures(3) + komi(6.5)
  });
});

describe('formatScoringResult', () => {
  it('黒勝ちの場合', () => {
    const result = formatScoringResult({
      territoryMap: [], blackTerritory: 30, whiteTerritory: 20,
      deadBlackStones: 0, deadWhiteStones: 0,
      blackTotal: 35, whiteTotal: 26.5,
    });
    expect(result).toBe('B+8.5');
  });

  it('白勝ちの場合', () => {
    const result = formatScoringResult({
      territoryMap: [], blackTerritory: 20, whiteTerritory: 20,
      deadBlackStones: 0, deadWhiteStones: 0,
      blackTotal: 25, whiteTotal: 32.5,
    });
    expect(result).toBe('W+7.5');
  });

  it('ジゴの場合', () => {
    const result = formatScoringResult({
      territoryMap: [], blackTerritory: 20, whiteTerritory: 20,
      deadBlackStones: 0, deadWhiteStones: 0,
      blackTotal: 30, whiteTotal: 30,
    });
    expect(result).toBe('ジゴ');
  });
});

describe('formatScoringResultJa（整地中の画面表示）', () => {
  const scoring = (blackTotal: number, whiteTotal: number) => ({
    territoryMap: [], blackTerritory: 0, whiteTerritory: 0,
    deadBlackStones: 0, deadWhiteStones: 0, blackTotal, whiteTotal,
  });

  it('符号ではなく囲碁の言い方で出す', () => {
    expect(formatScoringResultJa(scoring(26, 32.5))).toBe('白6目半勝ち');
    expect(formatScoringResultJa(scoring(35, 26.5))).toBe('黒8目半勝ち');
    expect(formatScoringResultJa(scoring(30, 25))).toBe('黒5目勝ち');
    expect(formatScoringResultJa(scoring(30, 30.5))).toBe('白半目勝ち');
    expect(formatScoringResultJa(scoring(30, 30))).toBe('ジゴ');
  });

  it('保存される結果コードは従来のまま（SGFのRE[]とDBが読む）', () => {
    expect(formatScoringResult(scoring(26, 32.5))).toBe('W+6.5');
  });
});

describe('formatGameResultMessage', () => {
  it('白の投了（黒の中押し勝ち）', () => {
    expect(formatGameResultMessage('B+R')).toBe('白が投了しました。黒の中押し勝ち');
  });

  it('黒の投了（白の中押し勝ち）', () => {
    expect(formatGameResultMessage('W+R')).toBe('黒が投了しました。白の中押し勝ち');
  });

  it('黒の目数勝ち', () => {
    expect(formatGameResultMessage('B+8.5')).toBe('黒の8目半勝ち');
  });

  it('白の目数勝ち（整数目数）', () => {
    expect(formatGameResultMessage('W+5')).toBe('白の5目勝ち');
  });

  it('半目勝ちは「0.5目」と言わない', () => {
    expect(formatGameResultMessage('W+0.5')).toBe('白の半目勝ち');
  });

  it('時間切れは日本語で表示する', () => {
    expect(formatGameResultMessage('W+T')).toBe('黒の時間切れ。白の勝ち');
    expect(formatGameResultMessage('B+T')).toBe('白の時間切れ。黒の勝ち');
  });

  it('未知の結果表記はそのままラベル付きで表示', () => {
    expect(formatGameResultMessage('強制終局')).toBe('結果: 強制終局');
  });
});

describe('timedOutColorFromResult / isTimeoutResult', () => {
  it('勝者表記から時間切れした側の色を返す', () => {
    expect(timedOutColorFromResult('B+T')).toBe('WHITE');
    expect(timedOutColorFromResult('W+T')).toBe('BLACK');
  });

  it('時間切れ以外は null / false', () => {
    expect(timedOutColorFromResult('B+R')).toBe(null);
    expect(timedOutColorFromResult('W+5')).toBe(null);
    expect(timedOutColorFromResult(null)).toBe(null);
    expect(isTimeoutResult('強制終局')).toBe(false);
    expect(isTimeoutResult('B+T')).toBe(true);
  });
});

describe('formatResultSpeech（終局の読み上げ）', () => {
  it('投了は「〇のちゅうおしがちです」と読み上げる（読点で語を区切りアクセントを頭に来させる）', () => {
    expect(formatResultSpeech('B+R')).toBe('黒、中押しがちです');
    expect(formatResultSpeech('W+R')).toBe('白、中押しがちです');
  });

  it('整地は目数を囲碁の言い方で読み上げる', () => {
    expect(formatResultSpeech('B+2.5')).toBe('黒、2目半がちです');
    expect(formatResultSpeech('W+0.5')).toBe('白、半目がちです');
    expect(formatResultSpeech('B+8.5')).toBe('黒、8目半がちです');
    expect(formatResultSpeech('W+5')).toBe('白、5目がちです');
    expect(formatResultSpeech('B+12.5')).toBe('黒、12目半がちです');
  });

  it('時間切れ・ジゴ・未知の表記は読み上げない（時間切れは秒読み側が喋る）', () => {
    expect(formatResultSpeech('B+T')).toBeNull();
    expect(formatResultSpeech('ジゴ')).toBeNull();
    expect(formatResultSpeech('強制終局')).toBeNull();
    expect(formatResultSpeech(null)).toBeNull();
  });
});
