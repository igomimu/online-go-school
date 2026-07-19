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

// 先生自身が対局者（黒番/白番）として対局に参加する場合の identity 固定値。
// src/utils/identityUtils.ts の TEACHER_IDENTITY と同じ値（フロントとサーバーで単一の真実）。
export const TEACHER_IDENTITY = 'teacher';

/**
 * 呼び出し者（生徒 or 対局者としての先生）が、この対局のどちらの色の対局者かを判定する。
 * 生徒: studentId(bare/sid:) が black_player/white_player と一致するか。
 * 先生: 対局そのものに `teacher` が対局者として登録されている場合のみ対局者として扱う
 *       （生徒vs生徒の対局を観戦している先生は対局者ではない）。
 */
export function resolvePlayerColor(
  caller: { isTeacher: boolean; studentId: string | null },
  game: { black_player: string; white_player: string },
): 'BLACK' | 'WHITE' | null {
  if (caller.isTeacher) {
    if (stripSid(game.black_player) === TEACHER_IDENTITY) return 'BLACK';
    if (stripSid(game.white_player) === TEACHER_IDENTITY) return 'WHITE';
    return null;
  }
  if (studentMatchesPlayer(caller.studentId, game.black_player)) return 'BLACK';
  if (studentMatchesPlayer(caller.studentId, game.white_player)) return 'WHITE';
  return null;
}

export function playersMatchPair(
  aBlack: string | null | undefined,
  aWhite: string | null | undefined,
  bBlack: string | null | undefined,
  bWhite: string | null | undefined,
): boolean {
  return (
    studentMatchesPlayer(aBlack, bBlack) &&
    studentMatchesPlayer(aWhite, bWhite)
  ) || (
    studentMatchesPlayer(aBlack, bWhite) &&
    studentMatchesPlayer(aWhite, bBlack)
  );
}
