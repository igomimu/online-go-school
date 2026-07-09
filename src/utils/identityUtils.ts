import type { Student } from '../types/classroom';

const STUDENT_PREFIX = 'sid:';

export function stripSid(value: string): string {
  return value.startsWith(STUDENT_PREFIX) ? value.slice(STUDENT_PREFIX.length) : value;
}

export function studentMatchesPlayer(
  studentId: string | null | undefined,
  player: string | null | undefined,
): boolean {
  if (!studentId || !player) return false;
  return stripSid(studentId) === stripSid(player);
}

export function makeStudentIdentity(studentId: string): string {
  return `${STUDENT_PREFIX}${studentId}`;
}

export function parseIdentity(identity: string): { type: 'student'; studentId: string } | { type: 'guest'; name: string } {
  if (identity.startsWith(STUDENT_PREFIX)) {
    return { type: 'student', studentId: identity.slice(STUDENT_PREFIX.length) };
  }
  return { type: 'guest', name: identity };
}

export function getDisplayName(identity: string, students: Student[]): string {
  const parsed = parseIdentity(identity);
  if (parsed.type === 'student') {
    const student = students.find(s => s.id === parsed.studentId)
      || students.find(s => s.studentCode === parsed.studentId)
      || students.find(s => s.name === parsed.studentId);
    return student?.name || `不明(${parsed.studentId.slice(0, 8)})`;
  }
  return parsed.name;
}

/**
 * 対局者の保存値（sid:uuid / uuid / ログインコード / 名前）を必ず「人が読める名前」に解決する。
 * IDは一切表示しない: 名簿で解決できないUUID/生徒IDは「対局者」にフォールバックする。
 */
export function resolvePlayerName(raw: string | null | undefined, students: Student[]): string {
  if (!raw) return '';
  const stripped = stripSid(raw);
  const found = students.find(
    s => s.id === stripped || s.studentCode === stripped || s.name === stripped,
  );
  if (found) return found.name;
  // 生徒ID（sid: 付き）やUUID素の値は絶対に表示しない
  if (raw.startsWith(STUDENT_PREFIX)) return '対局者';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stripped)) return '対局者';
  // 先生名など人が読める文字列はそのまま
  return stripped;
}

export function findStudentByIdentity(identity: string, students: Student[]): Student | undefined {
  const parsed = parseIdentity(identity);
  if (parsed.type === 'student') {
    const student = students.find(s => s.id === parsed.studentId)
      || students.find(s => s.studentCode === parsed.studentId);
    if (student) return student;

    // 生徒名でログインした場合のフォールバック
    return students.find(s => s.name === parsed.studentId);
  }
  // ゲスト: 名前で一致を試みる
  return students.find(s => s.name === identity);
}
