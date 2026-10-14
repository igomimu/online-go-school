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
    timeSystem: 'STANDARD',
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

/** NHK杯方式: 毎手30秒、使える考慮時間は1回60秒。 */
export function createNhkClock(considerationPeriods: number): GameClock {
  const periods = Math.min(10, Math.max(1, Math.floor(considerationPeriods || 1)));
  return {
    timeSystem: 'NHK',
    mainTimeSeconds: 0,
    byoyomiSeconds: 30,
    byoyomiPeriods: periods,
    considerationSeconds: 60,
    blackTimeLeft: 30,
    whiteTimeLeft: 30,
    blackByoyomiLeft: periods,
    whiteByoyomiLeft: periods,
    blackInByoyomi: true,
    whiteInByoyomi: true,
    blackInConsideration: false,
    whiteInConsideration: false,
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
  mainMinutes: 30,
  byoyomiEnabled: false,
  byoyomiSeconds: 30,
  byoyomiPeriods: 3,
};

/** 秒読みを「あり」に切り替えたときの基本値。 */
export const DEFAULT_BYOYOMI_TIME_SETTINGS: TimeSettings = {
  mainMinutes: 0,
  byoyomiEnabled: true,
  byoyomiSeconds: 30,
  byoyomiPeriods: 3,
};

/** TimeSettings → GameClock。持ち時間0＆秒読みなしなら undefined（時間無制限）。 */
export function timeSettingsToClock(s: TimeSettings): GameClock | undefined {
  const main = Math.max(0, Math.floor(s.mainMinutes || 0)) * 60;
  const byoSec = s.byoyomiEnabled ? s.byoyomiSeconds : 0;
  const byoPer = s.byoyomiEnabled ? Math.max(1, Math.floor(s.byoyomiPeriods || 0)) : 0;
  return createClock(main, byoSec, byoPer);
}

// --- 再開のときに講師が持ち時間を決め直す（2026-10-14 三村さん「時間状況に合わせて」） ---
// 授業の残り時間に合わせて、黒白それぞれの残りと秒読みを選び直してから続きを打つ。
export interface ResumeTimeSettings {
  blackSeconds: number;     // 黒の残りの持ち時間（秒）。0なら秒読みから
  whiteSeconds: number;     // 白の残りの持ち時間（秒）
  byoyomiEnabled: boolean;
  byoyomiSeconds: number;
  byoyomiPeriods: number;
}

/** いまの時計から、決め直しの入力欄の初期値を作る（秒読み中の側は持ち時間0） */
export function resumeTimeSettingsFromClock(clock: GameClock | null | undefined): ResumeTimeSettings {
  if (!clock) {
    return { blackSeconds: 0, whiteSeconds: 0, byoyomiEnabled: false, byoyomiSeconds: 30, byoyomiPeriods: 3 };
  }
  const remain = (left: number, inByoyomi?: boolean) => (inByoyomi ? 0 : Math.max(0, Math.round(left)));
  const hasByoyomi = clock.timeSystem !== 'NHK' && clock.byoyomiPeriods > 0 && clock.byoyomiSeconds > 0;
  return {
    blackSeconds: clock.timeSystem === 'NHK' ? 0 : remain(clock.blackTimeLeft, clock.blackInByoyomi),
    whiteSeconds: clock.timeSystem === 'NHK' ? 0 : remain(clock.whiteTimeLeft, clock.whiteInByoyomi),
    byoyomiEnabled: clock.timeSystem === 'NHK' || hasByoyomi,
    byoyomiSeconds: hasByoyomi ? clock.byoyomiSeconds : 30,
    byoyomiPeriods: hasByoyomi ? clock.byoyomiPeriods : 3,
  };
}

/** 決め直しが打てる設定か。持ち時間0で秒読みも無い側は、再開した瞬間に切れてしまう */
export function resumeTimeSettingsError(s: ResumeTimeSettings): string | null {
  if (s.byoyomiEnabled) return null;
  if (s.blackSeconds === 0 && s.whiteSeconds === 0) return null; // 両方0・秒読みなし＝時間無制限
  if (s.blackSeconds === 0 || s.whiteSeconds === 0) {
    return '秒読みなしのときは、黒・白とも持ち時間を1秒以上にしてください（両方0なら時間無制限）';
  }
  return null;
}

/**
 * 決め直した設定から時計を作る。null は時間無制限。
 * 秒読みの設定（秒数・回数）が前と同じなら、使った回数は戻さない。変えたら新しい回数から。
 */
export function clockFromResumeTimeSettings(
  s: ResumeTimeSettings,
  previous?: GameClock | null,
): GameClock | null {
  const byoSec = s.byoyomiEnabled ? s.byoyomiSeconds : 0;
  const byoPer = s.byoyomiEnabled ? Math.max(1, Math.floor(s.byoyomiPeriods || 0)) : 0;
  const black = Math.max(0, Math.floor(s.blackSeconds || 0));
  const white = Math.max(0, Math.floor(s.whiteSeconds || 0));
  if (black === 0 && white === 0 && byoPer === 0) return null;

  const sameByoyomi = !!previous && previous.timeSystem !== 'NHK'
    && previous.byoyomiSeconds === byoSec && previous.byoyomiPeriods === byoPer;
  const periodsLeft = (prevLeft: number | undefined) =>
    sameByoyomi && prevLeft !== undefined ? Math.min(byoPer, Math.max(1, prevLeft)) : byoPer;
  const side = (main: number, prevLeft: number | undefined) => main > 0
    ? { timeLeft: main, inByoyomi: false, byoyomiLeft: byoPer }
    : { timeLeft: byoSec, inByoyomi: true, byoyomiLeft: periodsLeft(prevLeft) };
  const b = side(black, previous?.blackByoyomiLeft);
  const w = side(white, previous?.whiteByoyomiLeft);
  return {
    timeSystem: 'STANDARD',
    mainTimeSeconds: Math.max(black, white),
    byoyomiSeconds: byoSec,
    byoyomiPeriods: byoPer,
    blackTimeLeft: b.timeLeft,
    whiteTimeLeft: w.timeLeft,
    blackByoyomiLeft: b.byoyomiLeft,
    whiteByoyomiLeft: w.byoyomiLeft,
    blackInByoyomi: b.inByoyomi,
    whiteInByoyomi: w.inByoyomi,
    lastTickTime: null,
  };
}

// 相手の着手が自分の端末に届くまでの遅れは、次に打つ人の考慮時間から引かない。
// 計時は「着手した端末の時刻」ではなく「その着手を受け取った時刻」から始める。
// ただし戻すのは最大この値まで（再入場・復帰で、使ったはずの時間が回復しないように）。
export const CLOCK_LAG_ALLOWANCE_MS = 2000;

// 残りが0になった瞬間には切らず、この秒数だけ待ってから切れ負けにする。
// tick は1秒間隔なので、実際の猶予は 0.5〜1.5 秒になる。
export const TIMEUP_GRACE_SECONDS = 0.5;

/**
 * 残りが0を割ってから切れ負けを宣言してよいか。
 * 0になった瞬間には切らない（通信の遅れで数百ミリ秒ぶん先に進むことがあるため）。
 */
export function shouldDeclareTimeUp(remainingSeconds: number): boolean {
  return remainingSeconds <= -TIMEUP_GRACE_SECONDS;
}

/**
 * サーバーから届いた時計を、受け取った側の時刻で計り直す。
 * lastTickTime は着手した端末が書いた時刻なので、そのまま使うと
 * 「相手が打ってから自分に届くまで」が自分の持ち時間から引かれる。
 * 端末どうしの時計ズレも同じ向きに効くため、受信時刻へ寄せる。
 */
export function startClockOnReceipt(clock: GameClock, now = Date.now()): GameClock {
  if (clock.lastTickTime === null) return clock;
  const startedAt = Math.min(now, clock.lastTickTime + CLOCK_LAG_ALLOWANCE_MS);
  return { ...clock, lastTickTime: startedAt };
}

// 時間表示フォーマット
// 残り時間は切れ負けの猶予のあいだだけ負になる（useLiveGame の TIMEUP_GRACE_SECONDS）。
// 「-1:00」と出ては読めないので、表示は 0 で止める。
export function formatTime(seconds: number): string {
  const clamped = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const m = Math.floor(clamped / 60);
  const s = Math.floor(clamped % 60);
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

      if (game.clock.timeSystem === 'NHK') {
        let inConsideration = isBlack
          ? !!game.clock.blackInConsideration
          : !!game.clock.whiteInConsideration;

        if (newTimeLeft <= 0) {
          if (newByoyomiLeft > 0) {
            newByoyomiLeft -= 1;
            newTimeLeft = game.clock.considerationSeconds ?? 60;
            inConsideration = true;
          } else {
            onTimeUp(game.id, game.currentColor);
            continue;
          }
        }

        updateGameClock(game.id, {
          ...game.clock,
          lastTickTime: now,
          ...(isBlack
            ? {
                blackTimeLeft: newTimeLeft,
                blackByoyomiLeft: newByoyomiLeft,
                blackInByoyomi: true,
                blackInConsideration: inConsideration,
              }
            : {
                whiteTimeLeft: newTimeLeft,
                whiteByoyomiLeft: newByoyomiLeft,
                whiteInByoyomi: true,
                whiteInConsideration: inConsideration,
              }),
        });
        continue;
      }

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
  if (clock.timeSystem === 'NHK') {
    // 次に打つ側も毎手30秒から始まる。前の手で戻っているはずだが、ここでも揃える（下の説明）
    return {
      ...clock,
      lastTickTime: now,
      blackTimeLeft: 30, blackInByoyomi: true, blackInConsideration: false,
      whiteTimeLeft: 30, whiteInByoyomi: true, whiteInConsideration: false,
    };
  }
  const moverInByoyomi = isBlack ? clock.blackInByoyomi : clock.whiteInByoyomi;

  // 着手した側: 秒読み中は各手ごとに満タン（B秒）へ戻す。
  let timeLeft = isBlack ? clock.blackTimeLeft : clock.whiteTimeLeft;
  if (moverInByoyomi) {
    timeLeft = clock.byoyomiSeconds;
  } else if (timeLeft <= 0 && clock.byoyomiPeriods > 0) {
    // 旧データ救済（inByoyomi 未設定で持ち時間切れ）
    timeLeft = clock.byoyomiSeconds;
  }

  // 次に打つ側が秒読み中なら、満タン（B秒）から始める。
  // 前の手で本人の端末が満タンに戻して保存しているが、こちらの端末がその保存結果を
  // 取りこぼすと（回線が不安定なとき）、本人の手番中にこちらで数えた古い残りが残る。
  // それをそのまま書くと「20秒で打ったのに、次の手番が21秒から始まる」
  // （2026-10-14 井町さんの報告）。秒読みの手番は必ず満タンで始まるので、ここで揃える。
  const nextInByoyomi = isBlack ? clock.whiteInByoyomi : clock.blackInByoyomi;
  const nextReset = nextInByoyomi
    ? (isBlack ? { whiteTimeLeft: clock.byoyomiSeconds } : { blackTimeLeft: clock.byoyomiSeconds })
    : {};
  return {
    ...clock,
    lastTickTime: now,
    ...(isBlack ? { blackTimeLeft: timeLeft } : { whiteTimeLeft: timeLeft }),
    ...nextReset,
  };
}
