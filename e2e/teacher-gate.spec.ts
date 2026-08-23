import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { TEST_STUDENT_A, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher, openClassroomAndConnect } from './helpers/teacher-actions';

/**
 * 先生が教室を開くまで、生徒は入れない（IGC＝ネット囲碁学園と同じ作り）。
 *
 * 判定は api/token.ts の中で LiveKit に問い合わせて行う。フロントで弾くのではなく
 * トークンを渡さないので、生徒は繋がりようがない＝参加者分を 1 分も使わない。
 * 待っている間に叩くのはトークンAPIだけで、LiveKit には触らない。
 */

test.describe('先生が居ないと生徒は入れない', () => {
  let teacherContext: BrowserContext;
  let studentContext: BrowserContext;
  let teacherPage: Page;
  let studentPage: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('gate');
    teacherContext = await browser.newContext();
    studentContext = await browser.newContext();

    // 名簿だけ用意する。先生はまだ教室を開かない。
    teacherPage = await teacherContext.newPage();
    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.reload();

    studentPage = await studentContext.newPage();
    await studentPage.clock.install();
    await studentPage.goto('/');
    await clearAllData(studentPage);
    await studentPage.reload();
  });

  test.afterEach(async () => {
    await studentContext?.close();
    await teacherContext?.close();
    await teardownSupabaseRoster(classroomId);
  });

  async function submitStudentLogin(): Promise<void> {
    await studentPage.goto(`/?classroomId=${encodeURIComponent(classroomId)}`);
    await studentPage.getByTestId('student-id-input').fill(TEST_STUDENT_A.code);
    await studentPage.getByTestId('student-login-button').click();
  }

  test('先生が開いていなければ、赤いエラーではなく「待っていてください」が出る', async () => {
    await submitStudentLogin();

    await expect(studentPage.getByText('先生がまだ教室を開いていません')).toBeVisible({ timeout: 30_000 });
    await expect(studentPage.getByText('先生を待っています…')).toBeVisible();
    // 「接続に失敗しました」のような、子どもが故障と受け取る出方をしない
    await expect(studentPage.getByText('接続に失敗しました')).toBeHidden();

    await studentPage.screenshot({ path: 'test-results/waiting-for-teacher.png', fullPage: true });
  });

  test('先生が教室を開くと、待っている生徒が自動で入れる', async () => {
    await submitStudentLogin();
    await expect(studentPage.getByText('先生がまだ教室を開いていません')).toBeVisible({ timeout: 30_000 });

    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);

    // 生徒側は 20 秒ごとに自分から入り直しにいく（押させない）
    await expect(async () => {
      await studentPage.clock.runFor(20_000);
      await expect(studentPage.getByText('先生がまだ教室を開いていません')).toBeHidden({ timeout: 3_000 });
    }).toPass({ timeout: 60_000 });

    await expect(studentPage.getByText('先生が対局を作成するのをお待ちください')).toBeVisible({ timeout: 30_000 });
  });
});
