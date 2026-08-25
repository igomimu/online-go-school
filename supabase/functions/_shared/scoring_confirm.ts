export type ScoringColor = 'BLACK' | 'WHITE';

/** 保存されている確定色の配列を、余計な値を落として正規化する。 */
export function normalizeScoringConfirmed(raw: unknown): ScoringColor[] {
  if (!Array.isArray(raw)) return [];
  const out: ScoringColor[] = [];
  for (const value of raw) {
    if ((value === 'BLACK' || value === 'WHITE') && !out.includes(value)) {
      out.push(value);
    }
  }
  return out;
}

/**
 * 整地の「確定」を1回受け取った後の状態。
 *
 * - 対局者は自分の色を積み、黒白が揃った時点で終局する（片方だけでは終わらない）。
 * - 講師は、対局者が操作できないときの代行として単独で終局させられる。
 */
export function applyScoringConfirmation(
  current: unknown,
  caller: { color: ScoringColor | null; isTeacher: boolean },
): { confirmed: ScoringColor[]; finished: boolean } {
  if (caller.isTeacher) {
    return { confirmed: ['BLACK', 'WHITE'], finished: true };
  }
  const confirmed = normalizeScoringConfirmed(current);
  if (caller.color && !confirmed.includes(caller.color)) {
    confirmed.push(caller.color);
  }
  return {
    confirmed,
    finished: confirmed.includes('BLACK') && confirmed.includes('WHITE'),
  };
}
