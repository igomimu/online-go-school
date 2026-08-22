import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { TEST_STUDENT_A, TEST_STUDENT_B, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher, openClassroomAndConnect, waitForStudentJoined, loadSgfForReview } from './helpers/teacher-actions';
import { loginAsStudent } from './helpers/student-actions';

// 2026-08-05: 対局中の生徒に検討を見せると対局の邪魔になるので、講師が参加者を選ぶ。
// 生徒一覧の「共有」列で外した生徒には、検討の開始そのものが届かないこと。
test('共有を外した生徒には検討が届かない', async ({ browser }) => {
  test.setTimeout(120_000);
  const classroomId = generateClassroomId('sharing');
  const contexts: BrowserContext[] = [];
  const newPage = async (): Promise<Page> => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    contexts.push(ctx);
    return ctx.newPage();
  };

  try {
    const teacherPage = await newPage();
    const studentAPage = await newPage();
    const studentBPage = await newPage();

    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.reload();

    for (const page of [studentAPage, studentBPage]) {
      await page.goto('/');
      await clearAllData(page);
      await setupClassroomData(page, classroomId);
      await page.reload();
    }

    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);
    await loginAsStudent(studentAPage, { studentCode: TEST_STUDENT_A.code, classroomId });
    await loginAsStudent(studentBPage, { studentCode: TEST_STUDENT_B.code, classroomId });
    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);
    await waitForStudentJoined(teacherPage, TEST_STUDENT_B.id);

    // 既定は全員に共有（チェック済み）
    const shareA = teacherPage.getByTestId(`share-sid:${TEST_STUDENT_A.id}`);
    const shareB = teacherPage.getByTestId(`share-sid:${TEST_STUDENT_B.id}`);
    await expect(shareA).toBeChecked();
    await expect(shareB).toBeChecked();

    // 生徒Aを共有から外す
    await shareA.uncheck();
    await expect(shareA).not.toBeChecked();
    await expect(shareB).toBeChecked();

    // 検討を開始すると、外した生徒Aの画面は変わらず、生徒Bだけ検討になる
    const review = await loadSgfForReview(teacherPage, '(;FF[4]GM[1]SZ[9];B[ee])');
    await expect(review.getByText('検討モード')).toBeVisible({ timeout: 15_000 });
    await expect(studentBPage.getByText('検討モード')).toBeVisible({ timeout: 15_000 });
    await expect(studentAPage.getByText('検討モード')).toHaveCount(0);
    await expect(studentAPage.getByText('先生が対局を作成するのをお待ちください')).toBeVisible();

    // 検討室から対象へ戻すと、その場で現在の検討へ参加できる
    const reviewShareA = review.getByTestId(`review-share-sid:${TEST_STUDENT_A.id}`);
    const reviewShareB = review.getByTestId(`review-share-sid:${TEST_STUDENT_B.id}`);
    await expect(reviewShareA).not.toBeChecked();
    await expect(reviewShareB).toBeChecked();
    await reviewShareA.check();
    await expect(studentAPage.getByText('検討モード')).toBeVisible({ timeout: 15_000 });
    await expect(studentAPage.getByText('0手目')).toBeVisible({ timeout: 10_000 });

    // 誤って参加させた生徒を検討室から外すと、即座にホームへ戻る
    await reviewShareB.uncheck();
    await expect(studentBPage.getByText('検討モード')).toHaveCount(0, { timeout: 15_000 });
    await expect(studentBPage.getByText('先生が対局を作成するのをお待ちください')).toBeVisible();

    // 盤を進めても、外した生徒には届かない
    await review.keyboard.press('ArrowRight');
    await expect(review.getByText('1手目')).toBeVisible({ timeout: 10_000 });
    await expect(studentAPage.getByText('1手目')).toBeVisible({ timeout: 10_000 });
    await expect(studentBPage.getByText('検討モード')).toHaveCount(0);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await teardownSupabaseRoster(classroomId);
  }
});
