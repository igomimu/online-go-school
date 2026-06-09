export const TEST_CLASSROOM_ID = 'e2e-test-classroom';
export const TEST_CLASSROOM_NAME = 'E2Eテスト教室';

/**
 * テストごとにユニークな教室IDを生成して、同一LiveKit Room上での
 * state混在（前テストの stale participants）を避ける。
 */
export function generateClassroomId(prefix: string = 'e2e'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// dojo-app students に student_type='net' / status='active' で実在する
// 専用テスト生徒（validate_student_session の UUID 実在チェックを通すため）。
export const TEST_STUDENT_A = {
  id: 'd3c90fa1-b1a2-4c3d-8e4f-5a6b7c8d9e0f',
  name: 'テスト生徒A',
  rank: '3K',
};

export const TEST_STUDENT_B = {
  id: 'e4d01fa2-b2a3-4c4d-9e5f-6a7b8c9d0e1f',
  name: 'テスト生徒B',
  rank: '2K',
};

// 先生E2Eを「本物の緑」にするには、本番 TEACHER_PASSWORD_HASH と整合する実パスワードが必要。
// 実行時に `TEST_TEACHER_PASSWORD=<実PW>` を env で注入する（コードには平文を置かない）。
// 未設定時は 'e2etest'（本番ハッシュと不一致 → validate_teacher_session 失敗 → 先生セッション未確立で
// 対局作成が 403 になり、E2E が落ちる＝虚偽の緑を踏まない）。
export const TEST_TEACHER_PASSWORD = process.env.TEST_TEACHER_PASSWORD ?? 'e2etest';
