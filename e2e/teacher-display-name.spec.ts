import { test, expect } from '@playwright/test';
import { TEST_STUDENT_A, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher, openClassroomAndConnect, waitForStudentJoined, createGame } from './helpers/teacher-actions';
import { loginAsStudent, enterAssignedGame } from './helpers/student-actions';

// 先生は三村さんと芳織先生の交代制で、identity はどちらも teacher（2026-10-12）。
// 表示名は先生の端末にしか無いので、生徒の盤では既定の「三村九段」が出ていた。
test('交代の先生の名前が生徒の盤に出る', async ({ browser }) => {
  const classroomId = generateClassroomId('tname');
  const tc = await browser.newContext();
  const sc = await browser.newContext();
  const t = await tc.newPage();
  const s = await sc.newPage();
  try {
    await t.goto('/');
    await clearAllData(t);
    await setupTeacherPassword(t, TEST_TEACHER_PASSWORD);
    await setupClassroomData(t, classroomId);
    await t.evaluate(() => localStorage.setItem('go-school-teacher-display-name', 'かおり先生'));
    await t.reload();
    await s.goto('/');
    await clearAllData(s);
    await setupClassroomData(s, classroomId);
    await s.reload();

    await loginAsTeacher(t);
    await openClassroomAndConnect(t);
    await loginAsStudent(s, { studentCode: TEST_STUDENT_A.code, classroomId });
    await waitForStudentJoined(t, TEST_STUDENT_A.id);
    await createGame(t, { blackName: TEST_STUDENT_A.name, whiteName: '先生', boardSize: 9, expectedPlayersCount: 2 });
    await enterAssignedGame(s);
    await expect(s.getByText('かおり先生').first()).toBeVisible({ timeout: 15_000 });
    await expect(s.getByText('三村九段')).toHaveCount(0);
  } finally {
    await tc.close();
    await sc.close();
    await teardownSupabaseRoster(classroomId);
  }
});
