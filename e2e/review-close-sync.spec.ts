import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { TEST_STUDENT_A, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher, openClassroomAndConnect, loadSgfForReview } from './helpers/teacher-actions';
import { loginAsStudent } from './helpers/student-actions';

const SGF = '(;FF[4]GM[1]SZ[19];B[dd];W[pp];B[dp];W[pd];B[cf];W[fq];B[dr];W[cn])';

/**
 * 先生が検討を閉じたら、生徒も自動的に閉じて通常のホーム画面へ戻る。
 *
 * 2026-08-26 実授業: 閉じても生徒側に検討が残る、あるいは中途半端な状態で
 * ホーム画面になる、と指摘を受けた。
 */
test.describe('検討を閉じたときの生徒側', () => {
  let teacherContext: BrowserContext;
  let studentContext: BrowserContext;
  let teacherPage: Page;
  let studentPage: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('close');
    teacherContext = await browser.newContext();
    studentContext = await browser.newContext();
    teacherPage = await teacherContext.newPage();
    studentPage = await studentContext.newPage();

    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.reload();
    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);
    await loginAsStudent(studentPage, { studentCode: TEST_STUDENT_A.code, classroomId });
  });

  test.afterEach(async () => {
    await teacherContext?.close();
    await studentContext?.close();
    if (classroomId) await teardownSupabaseRoster(classroomId);
  });

  test('先生が検討を閉じると、生徒も閉じてホーム画面に戻る', async () => {
    const review = await loadSgfForReview(teacherPage, SGF);
    await expect(review.getByText('検討モード')).toBeVisible({ timeout: 15_000 });

    // 何手か進めて、生徒に確実に届いた状態にする
    await review.getByTitle('10手進む').click();
    const studentBoard = studentPage.getByTestId('go-board');
    await expect(studentBoard).toBeVisible({ timeout: 20_000 });

    // 先生が検討を閉じる（別ウィンドウならウィンドウごと閉じる）
    if (review !== teacherPage) {
      await review.close();
    } else {
      await teacherPage.getByText('閉じる').first().click();
    }

    // 生徒の盤が消え、待機の画面へ戻る
    await expect(studentBoard).toBeHidden({ timeout: 20_000 });
    await expect(
      studentPage.getByText('先生が対局を作成するのをお待ちください'),
    ).toBeVisible({ timeout: 20_000 });
  });
});
