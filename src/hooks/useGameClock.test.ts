import { describe, it, expect } from 'vitest';
import { createClock, switchClock } from './useGameClock';
import type { GameClock } from '../types/game';

describe('createClock', () => {
  it('持ち時間ありは inByoyomi=false で開始', () => {
    const c = createClock(600, 30, 3)!;
    expect(c.blackTimeLeft).toBe(600);
    expect(c.blackInByoyomi).toBe(false);
    expect(c.blackByoyomiLeft).toBe(3);
  });

  it('持ち時間0は最初から秒読み（inByoyomi=true, timeLeft=B）', () => {
    const c = createClock(0, 30, 5)!;
    expect(c.blackTimeLeft).toBe(30);
    expect(c.whiteTimeLeft).toBe(30);
    expect(c.blackInByoyomi).toBe(true);
    expect(c.whiteInByoyomi).toBe(true);
  });

  it('持ち時間0・秒読み0は undefined', () => {
    expect(createClock(0, 0, 0)).toBeUndefined();
  });
});

describe('switchClock', () => {
  const base: GameClock = {
    mainTimeSeconds: 600, byoyomiSeconds: 30, byoyomiPeriods: 3,
    blackTimeLeft: 5, whiteTimeLeft: 600,
    blackByoyomiLeft: 3, whiteByoyomiLeft: 3,
    blackInByoyomi: true, whiteInByoyomi: false,
    lastTickTime: Date.now(),
  };

  it('秒読み中の着手者は満タン（B秒）に戻り、回数は減らない', () => {
    const next = switchClock(base, 'BLACK');
    expect(next.blackTimeLeft).toBe(30);       // 5秒残りでも満タンに回復
    expect(next.blackByoyomiLeft).toBe(3);     // 回数は消費しない
    expect(next.blackInByoyomi).toBe(true);
  });

  it('持ち時間中の着手者は残時間を維持（秒読みに入らない）', () => {
    const next = switchClock({ ...base, whiteTimeLeft: 400, whiteInByoyomi: false }, 'WHITE');
    expect(next.whiteTimeLeft).toBe(400);
    expect(next.whiteInByoyomi).toBe(false);
  });
});
