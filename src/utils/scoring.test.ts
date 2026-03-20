import { describe, it, expect } from 'vitest';
import { calculateTerritory, formatScoringResult } from './scoring';
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
