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
  return {
    mainTimeSeconds: mainTime,
    byoyomiSeconds: byoyomi,
    byoyomiPeriods: periods,
    blackTimeLeft: mainTime,
    whiteTimeLeft: mainTime,
    blackByoyomiLeft: periods,
    whiteByoyomiLeft: periods,
    lastTickTime: null,
  };
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
  gamesRef.current = games;
  // Track which warnings have been fired to avoid repeats
  const warnedRef = useRef(new Set<string>());

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

      let newTimeLeft = timeLeft - elapsed;
      let newByoyomiLeft = byoyomiLeft;

      if (newTimeLeft <= 0) {
        if (game.clock.byoyomiPeriods > 0 && newByoyomiLeft > 0) {
          // 秒読みに入る or 秒読みカウント消費
          if (timeLeft > 0) {
            // 持ち時間切れ → 秒読み開始
            newTimeLeft = game.clock.byoyomiSeconds;
          } else {
            // 秒読み中 → 1回消費
            newByoyomiLeft -= 1;
            if (newByoyomiLeft <= 0) {
              // 時間切れ
              onTimeUp(game.id, game.currentColor);
              continue;
            }
            newTimeLeft = game.clock.byoyomiSeconds;
          }
        } else {
          // 持ち時間切れ（秒読みなし）
          onTimeUp(game.id, game.currentColor);
          continue;
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
          ? { blackTimeLeft: newTimeLeft, blackByoyomiLeft: newByoyomiLeft }
          : { whiteTimeLeft: newTimeLeft, whiteByoyomiLeft: newByoyomiLeft }),
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

  // 着手した側: 秒読み中なら時間をリセット
  let timeLeft = isBlack ? clock.blackTimeLeft : clock.whiteTimeLeft;
  if (timeLeft <= 0 && clock.byoyomiPeriods > 0) {
    timeLeft = clock.byoyomiSeconds;
  }

  // 相手側: mainTime=0で未初期化の場合、秒読み時間を設定
  const opponentTimeLeft = isBlack ? clock.whiteTimeLeft : clock.blackTimeLeft;
  let opponentTime = opponentTimeLeft;
  if (opponentTime <= 0 && clock.mainTimeSeconds === 0 && clock.byoyomiPeriods > 0) {
    opponentTime = clock.byoyomiSeconds;
  }

  return {
    ...clock,
    lastTickTime: now,
    ...(isBlack
      ? { blackTimeLeft: timeLeft, whiteTimeLeft: opponentTime }
      : { whiteTimeLeft: timeLeft, blackTimeLeft: opponentTime }),
  };
}
