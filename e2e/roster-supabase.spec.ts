import { test, expect } from '@playwright/test';
import { allowTestClassroom, clearAllData, setupClassroomData, setupTeacherPassword, testClassroomName, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher } from './helpers/teacher-actions';
import {
  generateClassroomId,
  TEST_STUDENT_A,
  TEST_STUDENT_B,
  TEST_TEACHER_PASSWORD,
} from './helpers/test-data';

test.describe('生徒・教室名簿: Supabase 権威', () => {
  test('別ブラウザの先生ログインでも同じ教室と生徒が見える', async ({ browser, page }) => {
    const classroomId = generateClassroomId('roster');
    const classroomName = testClassroomName(classroomId);

    try {
      await page.goto('/');
      await clearAllData(page);
      await setupTeacherPassword(page, TEST_TEACHER_PASSWORD);
      await setupClassroomData(page, classroomId);
      await page.reload();

      await loginAsTeacher(page);
      await expect(page.getByText(classroomName)).toBeVisible();

      const secondContext = await browser.newContext();
      const secondPage = await secondContext.newPage();
      try {
        await secondPage.goto('/');
        await clearAllData(secondPage);
        await setupTeacherPassword(secondPage, TEST_TEACHER_PASSWORD);
        // 27ec7bd のテスト教室除外フィルタをこの教室だけ opt-out（サーバー名簿から見えるように）
        await allowTestClassroom(secondPage, classroomId);
        await secondPage.reload();

        await loginAsTeacher(secondPage, TEST_TEACHER_PASSWORD, classroomName);
        await expect(secondPage.getByText(classroomName)).toBeVisible();

        await secondPage.getByText('生徒情報').click();
        await expect(secondPage.getByText(TEST_STUDENT_A.name)).toBeVisible();
        await expect(secondPage.getByText(TEST_STUDENT_B.name)).toBeVisible();
      } finally {
        await secondContext.close();
      }
    } finally {
      await teardownSupabaseRoster(classroomId);
    }
  });
});
