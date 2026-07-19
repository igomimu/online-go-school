const STUDENT_PREFIX = 'sid:';

function stripSid(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith(STUDENT_PREFIX) ? trimmed.slice(STUDENT_PREFIX.length) : trimmed;
}

export function identityBelongsToStudent(
  identity: unknown,
  studentId: unknown,
): boolean {
  if (typeof identity !== 'string' || typeof studentId !== 'string') return false;
  if (!identity || !studentId) return false;
  return stripSid(identity) === stripSid(studentId);
}
