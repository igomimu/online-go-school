import type { Student } from '../types/classroom';

const STUDENT_PREFIX = 'sid:';

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
    const student = students.find(s => s.id === parsed.studentId);
    return student?.name || `不明(${parsed.studentId.slice(0, 8)})`;
  }
  return parsed.name;
}

export function findStudentByIdentity(identity: string, students: Student[]): Student | undefined {
  const parsed = parseIdentity(identity);
  if (parsed.type === 'student') {
    return students.find(s => s.id === parsed.studentId);
  }
  // ゲスト: 名前で一致を試みる
  return students.find(s => s.name === identity);
}
