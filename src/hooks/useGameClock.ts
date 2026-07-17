import { useEffect, useRef, useCallback } from 'react';
import type { GameSession, GameClock } from '../types/game';

// デフォルト持ち時間設定
export const CLOCK_PRESETS = [
  { label: '時間無制限', mainTime: 0, byoyomi: 0, periods: 0 },
  { label: '持15分 秒読30秒×3', mainTime: 900, byoyomi: 30, periods: 3 },
  { label: '持10分 秒読30秒×3', mainTime: 600, byoyomi: 30, periods: 3 },
  { label: '持5分 秒読30秒×3', mainTime: 300, byoyomi: 30, periods: 3 },
  { label: '秒読60秒×5', mainTime: 0, byoyomi: 60, periods: 5 },
  { label: '秒読30秒×5', mainTime: 0, byoyomi: 30, periods: 5 },
  { label: '秒読30秒×3', mainTime: 0, byoyomi: 30, periods: 3 },
] as const;

export function createClock(mainTime: number, byoyomi: number, periods: number): GameClock | undefined {
  if (mainTime === 0 && byoyomi === 0) return undefined;
  // 持ち時間0＝いきなり秒読みから開始
  const startInByoyomi = mainTime === 0 && byoyomi > 0;
  const startTime = startInByoyomi ? byoyomi : mainTime;
  return {
    mainTimeSeconds: mainTime,
    byoyomiSeconds: byoyomi,
    byoyomiPeriods: periods,
    blackTimeLeft: startTime,
    whiteTimeLeft: startTime,
    blackByoyomiLeft: periods,
    whiteByoyomiLeft: periods,
    blackInByoyomi: startInByoyomi,
    whiteInByoyomi: startInByoyomi,
    lastTickTime: null,
  };
}

// --- 講師が項目ごとに自由入力する持ち時間設定（ネット囲碁学園 NHK杯方式に準拠） ---
// 考慮時間（分）＝持ち時間 / 秒読み（秒/手）＝10・20・30・60 / 秒読みの回数＝考慮時間
export interface TimeSettings {
  mainMinutes: number;      // 持ち時間（分）。0で持ち時間なし
  byoyomiEnabled: boolean;  // 秒読み あり/なし
  byoyomiSeconds: number;   // 秒読み秒数（10/20/30/60）
  byoyomiPeriods: number;   // 秒読みの回数（考慮時間）
}

export const BYOYOMI_SECONDS_OPTIONS = [10, 20, 30, 60] as const;

export const DEFAULT_TIME_SETTINGS: TimeSettings = {
  mainMinutes: 0,
  byoyomiEnabled: true,
  byoyomiSeconds: 30,
  byoyomiPeriods: 1,
};

/** TimeSettings → GameClock。持ち時間0＆秒読みなしなら undefined（時間無制限）。 */
export function timeSettingsToClock(s: TimeSettings): GameClock | undefined {
  const main = Math.max(0, Math.floor(s.mainMinutes || 0)) * 60;
  const byoSec = s.byoyomiEnabled ? s.byoyomiSeconds : 0;
  const byoPer = s.byoyomiEnabled ? Math.max(1, Math.floor(s.byoyomiPeriods || 0)) : 0;
  return createClock(main, byoSec, byoPer);
}

// 時間表示フォーマット
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// 残り時間が警告閾値以下かチェック
export function isTimeLow(clock: GameClock, color: 'BLACK' | 'WHITE', threshold = 10): boolean {
  const timeLeft = color === 'BLACK' ? clock.blackTimeLeft : clock.whiteTimeLeft;
  return timeLeft > 0 && timeLeft <= threshold;
}

// 先生側で1秒ごとに時計を進めるhook
export function useGameClockTick(
  games: GameSession[],
  updateGameClock: (gameId: string, clock: GameClock) => void,
  onTimeUp: (gameId: string, color: 'BLACK' | 'WHITE') => void,
  onTimeWarning?: (gameId: string, color: 'BLACK' | 'WHITE', secondsLeft: number) => void,
) {
  const gamesRef = useRef(games);
  // Track which warnings have been fired to avoid repeats
  const warnedRef = useRef(new Set<string>());

  useEffect(() => {
    gamesRef.current = games;
  }, [games]);

  const tick = useCallback(() => {
    const now = Date.now();
    for (const game of gamesRef.current) {
      if (game.status !== 'playing' || !game.clock) continue;
      if (game.clock.lastTickTime === null) continue; // 時計が動いていない

      const elapsed = (now - game.clock.lastTickTime) / 1000;
      if (elapsed < 0.9) continue; // 1秒未満は無視

      const isBlack = game.currentColor === 'BLACK';
      const timeLeft = isBlack ? game.clock.blackTimeLeft : game.clock.whiteTimeLeft;
      const byoyomiLeft = isBlack ? game.clock.blackByoyomiLeft : game.clock.whiteByoyomiLeft;
      const inByoyomi = isBlack ? game.clock.blackInByoyomi : game.clock.whiteInByoyomi;

      let newTimeLeft = timeLeft - elapsed;
      let newByoyomiLeft = byoyomiLeft;
      let newInByoyomi = inByoyomi ?? false;

      if (newTimeLeft <= 0) {
        if (!newInByoyomi) {
          // 持ち時間切れ
          if (game.clock.byoyomiPeriods > 0) {
            // 秒読み開始（回数はまだ消費しない）
            newInByoyomi = true;
            newTimeLeft = game.clock.byoyomiSeconds;
          } else {
            onTimeUp(game.id, game.currentColor);
            continue;
          }
        } else {
          // 秒読みを1回使い切った → 回数を消費
          newByoyomiLeft -= 1;
          if (newByoyomiLeft <= 0) {
            onTimeUp(game.id, game.currentColor);
            continue;
          }
          newTimeLeft = game.clock.byoyomiSeconds;
        }
      }

      // 残り10秒警告
      if (onTimeWarning && newTimeLeft <= 10 && newTimeLeft > 0) {
        const warnKey = `${game.id}-${game.currentColor}-${Math.floor(newTimeLeft)}`;
        if (!warnedRef.current.has(warnKey)) {
          warnedRef.current.add(warnKey);
          onTimeWarning(game.id, game.currentColor, Math.floor(newTimeLeft));
          // 古い警告キーをクリーンアップ（100個以上溜まったら）
          if (warnedRef.current.size > 100) {
            warnedRef.current.clear();
          }
        }
      }

      const newClock: GameClock = {
        ...game.clock,
        lastTickTime: now,
        ...(isBlack
          ? { blackTimeLeft: newTimeLeft, blackByoyomiLeft: newByoyomiLeft, blackInByoyomi: newInByoyomi }
          : { whiteTimeLeft: newTimeLeft, whiteByoyomiLeft: newByoyomiLeft, whiteInByoyomi: newInByoyomi }),
      };

      updateGameClock(game.id, newClock);
    }
  }, [updateGameClock, onTimeUp, onTimeWarning]);

  useEffect(() => {
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [tick]);
}

// 着手後に時計を切り替える
export function switchClock(clock: GameClock, color: 'BLACK' | 'WHITE'): GameClock {
  const now = Date.now();
  const isBlack = color === 'BLACK';
  const moverInByoyomi = isBlack ? clock.blackInByoyomi : clock.whiteInByoyomi;

  // 着手した側: 秒読み中は各手ごとに満タン（B秒）へ戻す。
  let timeLeft = isBlack ? clock.blackTimeLeft : clock.whiteTimeLeft;
  if (moverInByoyomi) {
    timeLeft = clock.byoyomiSeconds;
  } else if (timeLeft <= 0 && clock.byoyomiPeriods > 0) {
    // 旧データ救済（inByoyomi 未設定で持ち時間切れ）
    timeLeft = clock.byoyomiSeconds;
  }

  // 相手側は自分の手番開始時点の値のまま（秒読みなら前手で満タンに戻っている）。
  return {
    ...clock,
    lastTickTime: now,
    ...(isBlack ? { blackTimeLeft: timeLeft } : { whiteTimeLeft: timeLeft }),
  };
}
