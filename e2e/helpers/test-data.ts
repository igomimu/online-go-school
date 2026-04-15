export const TEST_CLASSROOM_ID = 'e2e-test-classroom';
export const TEST_CLASSROOM_NAME = 'E2Eテスト教室';

/**
 * テストごとにユニークな教室IDを生成して、同一LiveKit Room上での
 * state混在（前テストの stale participants）を避ける。
 */
export function generateClassroomId(prefix: string = 'e2e'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const TEST_STUDENT_A = {
  id: 'e2e-student-a',
  name: 'テスト太郎',
  rank: '3K',
};

export const TEST_STUDENT_B = {
  id: 'e2e-student-b',
  name: 'テスト花子',
  rank: '2K',
};

export const TEST_TEACHER_PASSWORD = 'e2etest';
