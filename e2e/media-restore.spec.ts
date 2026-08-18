import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { TEST_STUDENT_A, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsStudent } from './helpers/student-actions';
import { loginAsTeacher, openClassroomAndConnect } from './helpers/teacher-actions';

/**
 * マイク・カメラの状態まわりの回帰テスト。
 *
 * 1. 自分のカメラを点けた直後に「カメラ オフ」が被らないこと。
 *    初回の公開は publish であって unmute ではないため TrackUnmuted が飛ばず、
 *    参加者一覧の自分だけ「切」のまま残っていた（2026-08-16）。
 * 2. 切断して入り直しても、前回のマイク・カメラの状態で始まること。
 */

const MOBILE = { width: 360, height: 780 };

test.describe('マイク・カメラの状態', () => {
  let teacherContext: BrowserContext;
  let studentContext: BrowserContext;
  let teacherPage: Page;
  let studentPage: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('media');
    teacherContext = await browser.newContext();
    studentContext = await browser.newContext({ viewport: MOBILE });
    teacherPage = await teacherContext.newPage();
    studentPage = await studentContext.newPage();

    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.reload();
    // 先生が教室を開くまで生徒は入れない
    await loginAsTeacher(teacherPage, TEST_TEACHER_PASSWORD);
    await openClassroomAndConnect(teacherPage);

    await studentPage.goto('/');
    await clearAllData(studentPage);
    await studentPage.reload();
  });

  test.afterEach(async () => {
    await teacherContext?.close();
    await studentContext?.close();
    await teardownSupabaseRoster(classroomId);
  });

  const micButton = (page: Page) => page.locator('header button', { hasText: 'マイク' }).first();
  const cameraButton = (page: Page) => page.locator('header button', { hasText: 'カメラ' }).first();

  test('カメラを点けたら自分の映像がそのまま映る', async () => {
    await loginAsStudent(studentPage, { studentCode: TEST_STUDENT_A.code, classroomId });

    await micButton(studentPage).click();
    await cameraButton(studentPage).click();
    await expect(cameraButton(studentPage)).toHaveAttribute('aria-pressed', 'true');
    await studentPage.waitForTimeout(2000);

    await expect(studentPage.getByText('カメラ オフ')).toHaveCount(0);
    await expect(studentPage.getByTitle('マイクが切れています')).toHaveCount(0);

    await cameraButton(studentPage).click();
    await expect(studentPage.getByText('カメラ オフ')).toBeVisible({ timeout: 10_000 });
  });

  test('切断して入り直しても、前回のマイク・カメラの状態で始まる', async () => {
    await loginAsStudent(studentPage, { studentCode: TEST_STUDENT_A.code, classroomId });

    // マイクだけ点けて出る
    await micButton(studentPage).click();
    await expect(micButton(studentPage)).toHaveAttribute('aria-pressed', 'true');
    await expect(cameraButton(studentPage)).toHaveAttribute('aria-pressed', 'false');
    await studentPage.getByTitle('切断').click();

    // 入り直す
    await loginAsStudent(studentPage, { studentCode: TEST_STUDENT_A.code, classroomId });
    await expect(micButton(studentPage)).toHaveAttribute('aria-pressed', 'true', { timeout: 15_000 });
    await expect(cameraButton(studentPage)).toHaveAttribute('aria-pressed', 'false');

    // マイクを切って出れば、次は切れたまま始まる
    await micButton(studentPage).click();
    await expect(micButton(studentPage)).toHaveAttribute('aria-pressed', 'false');
    await studentPage.getByTitle('切断').click();

    await loginAsStudent(studentPage, { studentCode: TEST_STUDENT_A.code, classroomId });
    await expect(micButton(studentPage)).toHaveAttribute('aria-pressed', 'false', { timeout: 15_000 });
  });
});
