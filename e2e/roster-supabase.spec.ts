import { test, expect } from '@playwright/test';
import { clearAllData, setupClassroomData, setupTeacherPassword, testClassroomName } from './helpers/setup';
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
      await secondPage.reload();

      await loginAsTeacher(secondPage, TEST_TEACHER_PASSWORD, classroomName);
      await expect(secondPage.getByText(classroomName)).toBeVisible();

      await secondPage.getByText('生徒情報').click();
      await expect(secondPage.getByText(TEST_STUDENT_A.name)).toBeVisible();
      await expect(secondPage.getByText(TEST_STUDENT_B.name)).toBeVisible();
    } finally {
      await secondContext.close();
    }
  });
});
