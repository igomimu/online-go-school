import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  CLOCK_LAG_ALLOWANCE_MS,
  createClock,
  createNhkClock,
  formatTime,
  shouldDeclareTimeUp,
  startClockOnReceipt,
  switchClock,
  useGameClockTick,
} from './useGameClock';
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

describe('startClockOnReceipt（通信の遅れを手番側に負わせない）', () => {
  const base: GameClock = {
    timeSystem: 'NHK',
    mainTimeSeconds: 0, byoyomiSeconds: 30, byoyomiPeriods: 3, considerationSeconds: 60,
    blackTimeLeft: 30, whiteTimeLeft: 30,
    blackByoyomiLeft: 3, whiteByoyomiLeft: 3,
    blackInByoyomi: true, whiteInByoyomi: true,
    lastTickTime: 1_000_000,
  };

  it('着手が届くまでの遅れは持ち時間から引かない（受け取った今から計り始める）', () => {
    // 相手の端末が打ったのは1.2秒前。その1.2秒は次に打つ人のものではない
    const next = startClockOnReceipt(base, base.lastTickTime! + 1_200);
    expect(next.lastTickTime).toBe(base.lastTickTime! + 1_200);
  });

  it('戻すのは最大2秒まで（再入場で使ったはずの時間が回復しない）', () => {
    // 60秒前の時計を持って入り直しても、返るのは2秒ぶんだけ
    const next = startClockOnReceipt(base, base.lastTickTime! + 60_000);
    expect(next.lastTickTime).toBe(base.lastTickTime! + CLOCK_LAG_ALLOWANCE_MS);
  });

  it('自分の端末の時計が相手より遅れていても、未来の時刻にはしない', () => {
    const next = startClockOnReceipt(base, base.lastTickTime! - 5_000);
    expect(next.lastTickTime).toBe(base.lastTickTime! - 5_000);
  });

  it('止まっている時計（lastTickTime=null）はそのまま', () => {
    const stopped = { ...base, lastTickTime: null };
    expect(startClockOnReceipt(stopped, Date.now())).toEqual(stopped);
  });
});

describe('formatTime', () => {
  it('切れ負けの猶予で残りが負になっても 0:00 と出す', () => {
    expect(formatTime(-0.4)).toBe('0:00');
    expect(formatTime(-1.2)).toBe('0:00');
  });

  it('通常の残り時間はそのまま', () => {
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(0)).toBe('0:00');
  });
});

describe('shouldDeclareTimeUp（0になった瞬間には切らない）', () => {
  it('残りがちょうど0でも、まだ切れ負けにしない', () => {
    expect(shouldDeclareTimeUp(0)).toBe(false);
    expect(shouldDeclareTimeUp(-0.2)).toBe(false);
    expect(shouldDeclareTimeUp(-0.49)).toBe(false);
  });

  it('猶予を過ぎたら切れ負け', () => {
    expect(shouldDeclareTimeUp(-0.5)).toBe(true);
    expect(shouldDeclareTimeUp(-1.1)).toBe(true);
  });

  it('残っているうちは当然切らない', () => {
    expect(shouldDeclareTimeUp(3)).toBe(false);
  });
});
