import { describe, it } from "https://deno.land/std@0.224.0/testing/bdd.ts";
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { restoreClockForTimeout, timedOutColorFromResult, type StoredClock } from './clock.ts';

const expect = (actual: any) => ({
  toBe: (expected: any) => assertEquals(actual, expected),
  toEqual: (expected: any) => assertEquals(actual, expected),
});

const baseClock = (over: Partial<StoredClock> = {}): StoredClock => ({
  mainTimeSeconds: 600,
  byoyomiSeconds: 30,
  byoyomiPeriods: 3,
  blackTimeLeft: 0,
  whiteTimeLeft: 120,
  blackByoyomiLeft: 0,
  whiteByoyomiLeft: 3,
  blackInByoyomi: true,
  whiteInByoyomi: false,
  lastTickTime: null,
  ...over,
});

describe('timedOutColorFromResult', () => {
  it('"B+T" は黒の勝ち＝白の時間切れ', () => {
    expect(timedOutColorFromResult('B+T')).toBe('WHITE');
  });
  it('"W+T" は白の勝ち＝黒の時間切れ', () => {
    expect(timedOutColorFromResult('W+T')).toBe('BLACK');
  });
  it('投了・整地・中断・空値では null', () => {
    expect(timedOutColorFromResult('B+R')).toBe(null);
    expect(timedOutColorFromResult('W+12.5')).toBe(null);
    expect(timedOutColorFromResult('強制終局')).toBe(null);
    expect(timedOutColorFromResult(null)).toBe(null);
  });
});

describe('restoreClockForTimeout', () => {
  it('秒読みありなら切れた側の秒読みを規定回数ぶん復活させる', () => {
    const restored = restoreClockForTimeout(baseClock(), 'W+T')!;
    expect(restored.blackTimeLeft).toBe(30);
    expect(restored.blackByoyomiLeft).toBe(3);
    expect(restored.blackInByoyomi).toBe(true);
    // 相手（切れていない側）の時計は触らない
    expect(restored.whiteTimeLeft).toBe(120);
    expect(restored.whiteByoyomiLeft).toBe(3);
  });

  it('秒読みなしの設定なら持ち時間を規定値まで戻す', () => {
    const clock = baseClock({
      byoyomiPeriods: 0,
      byoyomiSeconds: 0,
      mainTimeSeconds: 900,
      whiteTimeLeft: 0,
      whiteInByoyomi: false,
    });
    const restored = restoreClockForTimeout(clock, 'B+T')!;
    expect(restored.whiteTimeLeft).toBe(900);
    expect(restored.whiteInByoyomi).toBe(false);
  });

  it('持ち時間も秒読みも0の設定では最低60秒を与える', () => {
    const clock = baseClock({ byoyomiPeriods: 0, byoyomiSeconds: 0, mainTimeSeconds: 0, whiteTimeLeft: 0 });
    const restored = restoreClockForTimeout(clock, 'B+T')!;
    expect(restored.whiteTimeLeft).toBe(60);
  });

  it('時間切れ以外の終局では時計に触れない', () => {
    const clock = baseClock();
    expect(restoreClockForTimeout(clock, 'B+R')).toEqual(clock);
    expect(restoreClockForTimeout(clock, null)).toEqual(clock);
  });

  it('時間無制限（clockなし）でも壊れない', () => {
    expect(restoreClockForTimeout(null, 'B+T')).toBe(null);
  });
});
