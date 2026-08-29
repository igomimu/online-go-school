import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { TEST_STUDENT_A, TEST_STUDENT_B, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupClassroomData, setupTeacherPassword, teardownSupabaseRoster } from './helpers/setup';
import { loginAsStudent } from './helpers/student-actions';
import { loginAsTeacher, openClassroomAndConnect, waitForStudentJoined } from './helpers/teacher-actions';

test('Mクリア・Sクリア・共有を全員にが参加中の全生徒へ反映される', async ({ browser }) => {
  test.setTimeout(120_000);
  const classroomId = generateClassroomId('bulk-controls');
  const contexts: BrowserContext[] = [];
  const newPage = async (): Promise<Page> => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    contexts.push(context);
    return context.newPage();
  };

  try {
    const teacher = await newPage();
    const studentA = await newPage();
    const studentB = await newPage();

    await teacher.goto('/');
    await clearAllData(teacher);
    await setupTeacherPassword(teacher, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacher, classroomId);
    await teacher.reload();

    for (const student of [studentA, studentB]) {
      await student.goto('/');
      await clearAllData(student);
      await setupClassroomData(student, classroomId);
      await student.reload();
    }

    await loginAsTeacher(teacher);
    await openClassroomAndConnect(teacher);
    await loginAsStudent(studentA, { studentCode: TEST_STUDENT_A.code, classroomId });
    await loginAsStudent(studentB, { studentCode: TEST_STUDENT_B.code, classroomId });
    await waitForStudentJoined(teacher, TEST_STUDENT_A.id);
    await waitForStudentJoined(teacher, TEST_STUDENT_B.id);

    const studentMic = (page: Page) => page.locator('header button', { hasText: 'マイク' }).first();
    const studentSpeaker = (page: Page) => page.locator('header button', { hasText: 'スピーカー' }).first();
    await studentMic(studentA).click();
    await studentMic(studentB).click();
    await expect(studentMic(studentA)).toHaveAttribute('aria-pressed', 'true');
    await expect(studentMic(studentB)).toHaveAttribute('aria-pressed', 'true');

    await teacher.getByRole('button', { name: '音声Mをクリア' }).click();
    await expect(teacher.getByTestId(`mic-sid:${TEST_STUDENT_A.id}`)).not.toBeChecked();
    await expect(teacher.getByTestId(`mic-sid:${TEST_STUDENT_B.id}`)).not.toBeChecked();
    await expect(studentMic(studentA)).toHaveAttribute('aria-pressed', 'false');
    await expect(studentMic(studentB)).toHaveAttribute('aria-pressed', 'false');

    await teacher.getByRole('button', { name: '音声Sをクリア' }).click();
    await expect(teacher.getByTestId(`hear-sid:${TEST_STUDENT_A.id}`)).not.toBeChecked();
    await expect(teacher.getByTestId(`hear-sid:${TEST_STUDENT_B.id}`)).not.toBeChecked();
    await expect(studentSpeaker(studentA)).toHaveAttribute('aria-pressed', 'false');
    await expect(studentSpeaker(studentB)).toHaveAttribute('aria-pressed', 'false');

    const shareA = teacher.getByTestId(`share-sid:${TEST_STUDENT_A.id}`);
    const shareB = teacher.getByTestId(`share-sid:${TEST_STUDENT_B.id}`);
    await shareA.uncheck();
    await shareB.uncheck();
    await expect(shareA).not.toBeChecked();
    await expect(shareB).not.toBeChecked();

    await teacher.getByRole('button', { name: '共有を全員に' }).click();
    await expect(shareA).toBeChecked();
    await expect(shareB).toBeChecked();
  } finally {
    for (const context of contexts) await context.close().catch(() => {});
    await teardownSupabaseRoster(classroomId);
  }
});
