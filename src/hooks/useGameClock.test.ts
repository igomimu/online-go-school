import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import { createClock, createNhkClock, switchClock, useGameClockTick } from './useGameClock';
import type { GameClock, GameSession } from '../types/game';

afterEach(() => {
  vi.useRealTimers();
});

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

describe('NHK杯方式', () => {
  it('毎手30秒・考慮時間60秒を指定回数ぶん持って開始する', () => {
    const clock = createNhkClock(4);
    expect(clock.timeSystem).toBe('NHK');
    expect(clock.blackTimeLeft).toBe(30);
    expect(clock.blackByoyomiLeft).toBe(4);
    expect(clock.considerationSeconds).toBe(60);
    expect(clock.blackInConsideration).toBe(false);
  });

  it('着手後は考慮時間中でも次の手の30秒へ戻す', () => {
    const clock = createNhkClock(4);
    const next = switchClock({
      ...clock,
      blackTimeLeft: 42,
      blackByoyomiLeft: 3,
      blackInConsideration: true,
    }, 'BLACK');
    expect(next.blackTimeLeft).toBe(30);
    expect(next.blackByoyomiLeft).toBe(3);
    expect(next.blackInConsideration).toBe(false);
  });

  it('30秒を使うと考慮時間を1回消費して60秒へ切り替える', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-23T00:00:00Z'));
    const updateGameClock = vi.fn();
    const onTimeUp = vi.fn();
    const clock = {
      ...createNhkClock(2),
      blackTimeLeft: 1,
      lastTickTime: Date.now() - 2_000,
    };
    const game = {
      id: 'game-1',
      status: 'playing',
      currentColor: 'BLACK',
      clock,
    } as GameSession;

    renderHook(() => useGameClockTick([game], updateGameClock, onTimeUp));
    act(() => vi.advanceTimersByTime(1_000));

    expect(onTimeUp).not.toHaveBeenCalled();
    expect(updateGameClock).toHaveBeenCalledWith('game-1', expect.objectContaining({
      blackTimeLeft: 60,
      blackByoyomiLeft: 1,
      blackInConsideration: true,
    }));
  });

  it('最後の考慮時間を使い切ると時間切れになる', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-23T00:00:00Z'));
    const updateGameClock = vi.fn();
    const onTimeUp = vi.fn();
    const clock = {
      ...createNhkClock(1),
      blackTimeLeft: 1,
      blackByoyomiLeft: 0,
      blackInConsideration: true,
      lastTickTime: Date.now() - 2_000,
    };
    const game = {
      id: 'game-1',
      status: 'playing',
      currentColor: 'BLACK',
      clock,
    } as GameSession;

    renderHook(() => useGameClockTick([game], updateGameClock, onTimeUp));
    act(() => vi.advanceTimersByTime(1_000));

    expect(onTimeUp).toHaveBeenCalledWith('game-1', 'BLACK');
    expect(updateGameClock).not.toHaveBeenCalled();
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
