import type { Student } from '../types/classroom';

const STUDENT_PREFIX = 'sid:';
export const TEACHER_IDENTITY = 'teacher';
export const DEFAULT_TEACHER_DISPLAY_NAME = '三村九段';
const TEACHER_DISPLAY_NAME_KEY = 'go-school-teacher-display-name';

export function getTeacherDisplayName(): string {
  if (typeof localStorage === 'undefined') return DEFAULT_TEACHER_DISPLAY_NAME;
  try {
    return localStorage.getItem(TEACHER_DISPLAY_NAME_KEY)?.trim() || DEFAULT_TEACHER_DISPLAY_NAME;
  } catch {
    return DEFAULT_TEACHER_DISPLAY_NAME;
  }
}

export function setTeacherDisplayName(name: string): void {
  if (typeof localStorage === 'undefined') return;
  try {
    const trimmed = name.trim();
    if (trimmed) {
      localStorage.setItem(TEACHER_DISPLAY_NAME_KEY, trimmed);
    } else {
      localStorage.removeItem(TEACHER_DISPLAY_NAME_KEY);
    }
  } catch {
    // localStorage unavailable: keep default display name
  }
}

export function stripSid(value: string): string {
  return value.startsWith(STUDENT_PREFIX) ? value.slice(STUDENT_PREFIX.length) : value;
}

export function isTeacherIdentity(value: string | null | undefined): boolean {
  return !!value && stripSid(value) === TEACHER_IDENTITY;
}

export function studentMatchesPlayer(
  studentId: string | null | undefined,
  player: string | null | undefined,
): boolean {
  if (!studentId || !player) return false;
  return stripSid(studentId) === stripSid(player);
}

export function identityMatchesPlayer(
  identity: string | null | undefined,
  player: string | null | undefined,
): boolean {
  return studentMatchesPlayer(identity, player);
}

export function anyIdentityMatchesPlayer(
  identities: Array<string | null | undefined>,
  player: string | null | undefined,
): boolean {
  return identities.some(identity => identityMatchesPlayer(identity, player));
}

export function makeStudentIdentity(studentId: string): string {
  return `${STUDENT_PREFIX}${studentId}`;
}

export function studentIdentityCandidates(student: Pick<Student, 'id' | 'studentCode' | 'name'>): string[] {
  const values = [
    student.id,
    makeStudentIdentity(student.id),
    student.studentCode,
    student.studentCode ? makeStudentIdentity(student.studentCode) : '',
  ];
  return Array.from(new Set(values.filter((value): value is string => !!value)));
}

export function parseIdentity(identity: string): { type: 'student'; studentId: string } | { type: 'guest'; name: string } {
  if (identity.startsWith(STUDENT_PREFIX)) {
    return { type: 'student', studentId: identity.slice(STUDENT_PREFIX.length) };
  }
  return { type: 'guest', name: identity };
}

export function getDisplayName(identity: string, students: Student[]): string {
  if (isTeacherIdentity(identity)) return getTeacherDisplayName();

  const parsed = parseIdentity(identity);
  if (parsed.type === 'student') {
    const student = students.find(s => s.id === parsed.studentId)
      || students.find(s => s.studentCode === parsed.studentId);
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
  if (isTeacherIdentity(raw)) return getTeacherDisplayName();

  const stripped = stripSid(raw);
  const foundById = students.find(s => s.id === stripped || s.studentCode === stripped);
  if (foundById) return foundById.name;
  const nameMatches = students.filter(s => s.name === stripped);
  if (nameMatches.length === 1) return nameMatches[0].name;
  // 生徒ID（sid: 付き）やUUID素の値は絶対に表示しない
  if (raw.startsWith(STUDENT_PREFIX)) return '対局者';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(stripped)) return '対局者';
  // 先生名など人が読める文字列はそのまま
  return stripped;
}

export function findStudentByIdentity(identity: string, students: Student[]): Student | undefined {
  if (isTeacherIdentity(identity)) return undefined;

  const parsed = parseIdentity(identity);
  if (parsed.type === 'student') {
    return students.find(s => s.id === parsed.studentId)
      || students.find(s => s.studentCode === parsed.studentId);
  }
  // ゲスト: 名前で一致を試みる
  return students.find(s => s.name === identity);
}
