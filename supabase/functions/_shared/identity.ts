// 生徒 identity 正規化の単一の真実。
//
// 背景: LiveKit の参加者 identity と対局の black_player/white_player は `sid:<uuid>` 形式で
// 保存される（src/utils/identityUtils.ts の makeStudentIdentity）。一方、JWT の
// user_metadata.student_id は bare `<uuid>`（validate_student_session が dojo students.id を
// そのまま格納）。両者を素朴に `===` で比較すると常に不一致になり、生徒の権限チェックが
// 全失敗していた。比較時に `sid:` prefix の有無を吸収する。
//
// Deno Edge Function と Vitest の双方から import される純粋ロジック（外部依存なし）。

export const STUDENT_PREFIX = 'sid:';

/** `sid:` prefix があれば剥がす。無ければそのまま返す。 */
export function stripSid(value: string): string {
  return value.startsWith(STUDENT_PREFIX) ? value.slice(STUDENT_PREFIX.length) : value;
}

/** bare UUID を保存形式 `sid:<uuid>` に正規化する（player_id 保存用）。 */
export function toStudentIdentity(studentId: string): string {
  return studentId.startsWith(STUDENT_PREFIX) ? studentId : `${STUDENT_PREFIX}${studentId}`;
}

/**
 * 認証済み生徒 ID（bare or sid:）が対局者欄の値（sid: or bare）と一致するか。
 * prefix の有無を両側で吸収して照合する。
 */
export function studentMatchesPlayer(
  studentId: string | null | undefined,
  player: string | null | undefined,
): boolean {
  if (!studentId || !player) return false;
  return stripSid(studentId) === stripSid(player);
}
