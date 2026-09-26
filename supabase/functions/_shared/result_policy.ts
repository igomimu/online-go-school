// 生徒が勝敗を書き込める範囲の決まり（2026-09-27）。
//
// 道場ランクは終局した対局の結果からDBのトリガーが自動で上げ下げする。
// 生徒が自分で好きな結果を書き込めると、APIを直接呼んで「3連勝」を作れてしまう。
// そこで生徒が書けるのは「自分の負け」（投了・自分の時間切れ）だけにし、
// 整地の結果は黒白の両方が同じ結果に同意したときだけ終局させる。
//
// Deno Edge Function から import される純粋ロジック（外部依存なし）。

export type PlayerColor = 'BLACK' | 'WHITE';

/** 生徒が勝敗の操作をしてよい対局の状態（終局済み・中断中は触らせない） */
export const STUDENT_MUTABLE_STATUSES = ['playing', 'scoring'] as const;

export function isStudentMutableStatus(status: unknown): boolean {
  return typeof status === 'string'
    && (STUDENT_MUTABLE_STATUSES as readonly string[]).includes(status);
}

/**
 * 生徒が finish で書き込んでよい結果か。
 * 自分が負ける投了（相手の色+R）と、自分の時間切れ（相手の色+T）だけを許す。
 */
export function studentMayFinishWith(result: unknown, callerColor: PlayerColor | null): boolean {
  if (!callerColor || typeof result !== 'string') return false;
  const m = /^([BW])\+([RT])$/.exec(result);
  if (!m) return false;
  const winner: PlayerColor = m[1] === 'B' ? 'BLACK' : 'WHITE';
  return winner !== callerColor;
}

/**
 * 整地の確定で、対局者（生徒）どうしの結果が一致しているか。
 * 先に確定した側の結果が控えてあり、後から確定した側の結果と同じときだけ true。
 */
export function scoringResultsAgree(proposed: unknown, result: unknown): boolean {
  return typeof proposed === 'string'
    && typeof result === 'string'
    && proposed.trim() !== ''
    && proposed.trim() === result.trim();
}
