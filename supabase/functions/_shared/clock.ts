// 時間切れで終わった対局を再開するときの時計復元ロジック（純粋関数）。
// Deno Edge Function と Vitest の双方から import される（外部依存なし）。

export interface StoredClock {
  timeSystem?: 'STANDARD' | 'NHK'
  mainTimeSeconds: number
  byoyomiSeconds: number
  byoyomiPeriods: number
  considerationSeconds?: number
  blackTimeLeft: number
  whiteTimeLeft: number
  blackByoyomiLeft: number
  whiteByoyomiLeft: number
  blackInByoyomi?: boolean
  whiteInByoyomi?: boolean
  blackInConsideration?: boolean
  whiteInConsideration?: boolean
  lastTickTime: number | null
}

/**
 * 時間切れ負けで終わった対局なら、切れた側の色を返す（それ以外は null）。
 * result は勝者表記なので "B+T" は「黒の勝ち＝白が時間切れ」。
 */
export function timedOutColorFromResult(result: string | null | undefined): 'BLACK' | 'WHITE' | null {
  const m = typeof result === 'string' ? result.trim().match(/^([BW])\+T$/i) : null
  if (!m) return null
  return m[1].toUpperCase() === 'B' ? 'WHITE' : 'BLACK'
}

/**
 * 時間切れで終わった対局を再開する際、切れた側の持ち時間を戻す。
 * 戻さないと再開直後にまた時間切れになるため（回線トラブルからの復帰が主用途）。
 *
 *  - 秒読みあり: 秒読み回数を規定回数ぶん復活させ、秒読み中の状態から再開する
 *  - 秒読みなし: 持ち時間を規定値まで戻す（最低60秒は確保する）
 *
 * 時間切れ以外の終局（投了・整地・中断）では時計に触れない。
 */
export function restoreClockForTimeout(
  clock: StoredClock | null | undefined,
  result: string | null | undefined,
): StoredClock | null {
  if (!clock) return clock ?? null
  const timedOut = timedOutColorFromResult(result)
  if (!timedOut) return clock

  const useByoyomi = (clock.byoyomiPeriods ?? 0) > 0 && (clock.byoyomiSeconds ?? 0) > 0
  const timeLeft = useByoyomi ? clock.byoyomiSeconds : Math.max(clock.mainTimeSeconds ?? 0, 60)
  const byoyomiLeft = useByoyomi ? clock.byoyomiPeriods : (clock.byoyomiPeriods ?? 0)

  const isNhk = clock.timeSystem === 'NHK'
  return timedOut === 'BLACK'
    ? {
        ...clock,
        blackTimeLeft: timeLeft,
        blackByoyomiLeft: byoyomiLeft,
        blackInByoyomi: useByoyomi,
        ...(isNhk ? { blackInConsideration: false } : {}),
      }
    : {
        ...clock,
        whiteTimeLeft: timeLeft,
        whiteByoyomiLeft: byoyomiLeft,
        whiteInByoyomi: useByoyomi,
        ...(isNhk ? { whiteInConsideration: false } : {}),
      }
}

/** 一時停止していた時計を、再開操作の瞬間から進める。 */
export function startClock(
  clock: StoredClock | null | undefined,
  startedAt = Date.now(),
): StoredClock | null {
  return clock ? { ...clock, lastTickTime: startedAt } : null
}
