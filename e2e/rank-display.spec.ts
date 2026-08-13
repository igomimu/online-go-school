import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { TEST_STUDENT_A, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import {
  loginAsTeacher,
  openClassroomAndConnect,
  waitForStudentJoined,
  clickToolbarMenuItem,
} from './helpers/teacher-actions';
import { loginAsStudent } from './helpers/student-actions';

/**
 * 棋力の見せ方は教室ごとに選ぶ（2026-08-13 三村さん）。
 *   段級 … 一般の大人向け。「初段」「3級」
 *   ランク … 道場の生徒向け。「R12」（0が最強）
 */
test.describe('棋力の表示方法', () => {
  let teacherContext: BrowserContext;
  let studentContext: BrowserContext;
  let teacherPage: Page;
  let studentPage: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('rank');
    teacherContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    studentContext = await browser.newContext();
    teacherPage = await teacherContext.newPage();
    studentPage = await studentContext.newPage();

    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.reload();

    await studentPage.goto('/');
    await clearAllData(studentPage);
    await studentPage.reload();
    await loginAsStudent(studentPage, { studentCode: TEST_STUDENT_A.code, classroomId });

    await loginAsTeacher(teacherPage, TEST_TEACHER_PASSWORD);
    await openClassroomAndConnect(teacherPage);
    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);
  });

  test.afterEach(async () => {
    await teacherContext?.close();
    await studentContext?.close();
    await teardownSupabaseRoster(classroomId);
  });

  test('教室設定で段級とランクを切り替えられる', async () => {
    // 生徒の棋力を段級=初段 / ランク=R12 にする
    await teacherPage.getByRole('button', { name: '編集', exact: true }).first().click();
    await teacherPage.getByTestId('student-rank-select').selectOption('初段');
    await teacherPage.getByTestId('student-rating-select').selectOption('R12');
    await teacherPage.getByRole('button', { name: '保存', exact: true }).click();
    await expect(teacherPage.getByTestId('student-rank-select')).toHaveCount(0, { timeout: 10_000 });

    // 既定は段級なので「初段」が出る
    const rankCell = teacherPage.getByTestId('student-rank-cell').first();
    await expect(rankCell).toHaveText('初段', { timeout: 10_000 });

    // 教室設定を「ランク」に変える
    await clickToolbarMenuItem(teacherPage, '生徒管理', '生徒入替');
    await teacherPage.getByTestId('rank-display-select').selectOption('rating');
    await teacherPage.getByRole('button', { name: '保存', exact: true }).click();
    await expect(teacherPage.getByTestId('rank-display-select')).toHaveCount(0, { timeout: 10_000 });

    // 一覧が R12 に変わる
    await expect(rankCell).toHaveText('R12', { timeout: 10_000 });
    await teacherPage.screenshot({ path: 'test-results/rank-display-rating.png' });
  });
});
