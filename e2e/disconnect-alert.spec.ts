import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { TEST_STUDENT_A, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher, openClassroomAndConnect, waitForStudentJoined } from './helpers/teacher-actions';
import { loginAsStudent } from './helpers/student-actions';
import { recordNotificationSounds, playedSounds } from './helpers/audio';

// 2026-08-05: 接続が切れたことに講師がすぐ気づけること。音と、誰が切れたかの表示。
test('生徒の接続が切れると、講師に音とお知らせが出る', async ({ browser }) => {
  const classroomId = generateClassroomId('disconnect');
  let teacherContext: BrowserContext | null = null;
  let studentContext: BrowserContext | null = null;

  try {
    teacherContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    studentContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const teacherPage: Page = await teacherContext.newPage();
    const studentPage: Page = await studentContext.newPage();

    await recordNotificationSounds(teacherPage);

    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.reload();

    await studentPage.goto('/');
    await clearAllData(studentPage);
    await setupClassroomData(studentPage, classroomId);
    await studentPage.reload();

    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);
    await loginAsStudent(studentPage, { studentCode: TEST_STUDENT_A.code, classroomId });
    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);

    // 生徒の回線が落ちる
    await studentContext.close();
    studentContext = null;

    const alert = teacherPage.getByTestId('classroom-alert-disconnect');
    await expect(alert).toBeVisible({ timeout: 30_000 });
    await expect(alert).toContainText(TEST_STUDENT_A.name);

    // 接続切れの音（低い2音の1音目 440Hz）を鳴らそうとしている
    await expect.poll(async () => (await playedSounds(teacherPage)).includes(440), {
      timeout: 10_000,
    }).toBe(true);

    // 閉じられる
    await alert.getByRole('button', { name: '閉じる' }).click();
    await expect(teacherPage.getByTestId('classroom-alert-disconnect')).toHaveCount(0);
  } finally {
    await teacherContext?.close();
    await studentContext?.close();
    await teardownSupabaseRoster(classroomId);
  }
});
