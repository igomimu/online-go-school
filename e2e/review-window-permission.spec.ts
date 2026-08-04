import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { TEST_STUDENT_A, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher, loadSgfForReview, openClassroomAndConnect, waitForStudentJoined } from './helpers/teacher-actions';
import { loginAsStudent } from './helpers/student-actions';

// 2026-08-05:
// ①検討は先生の別ウィンドウに出る（検討中も本体の教室ホームを操作できる。IGC同様）
// ②生徒ごとに着手を許可でき、許可された生徒の手は先生の盤にも入る
test.describe('検討の別ウィンドウと生徒の着手権限', () => {
  let teacherContext: BrowserContext;
  let studentContext: BrowserContext;
  let teacherPage: Page;
  let studentPage: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('review-window');
    teacherContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    studentContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    teacherPage = await teacherContext.newPage();
    studentPage = await studentContext.newPage();

    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.reload();

    await studentPage.goto('/');
    await clearAllData(studentPage);
    await setupClassroomData(studentPage, classroomId);
    await studentPage.reload();
  });

  test.afterEach(async () => {
    await teacherContext?.close();
    await studentContext?.close();
    if (classroomId) await teardownSupabaseRoster(classroomId);
  });

  test('検討は別ウィンドウに出て、本体は教室ホームのまま', async () => {
    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);

    const review = await loadSgfForReview(teacherPage, '(;FF[4]GM[1]SZ[9])');
    expect(review).not.toBe(teacherPage);
    await expect(review.getByText('検討モード')).toBeVisible({ timeout: 15_000 });

    // 本体は覆われず、教室ホーム（生徒一覧）が操作できるまま
    await expect(teacherPage.getByText('検討モード')).toHaveCount(0);
    await expect(teacherPage.getByRole('button', { name: 'SGF読込', exact: true })).toBeVisible();
  });

  test('着手を許可した生徒の手が、先生の検討盤にも入る', async () => {
    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);
    await loginAsStudent(studentPage, { studentCode: TEST_STUDENT_A.code, classroomId });
    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);

    const review = await loadSgfForReview(teacherPage, '(;FF[4]GM[1]SZ[9])');
    await expect(review.getByText('検討モード')).toBeVisible({ timeout: 15_000 });
    await expect(studentPage.getByText('検討モード')).toBeVisible({ timeout: 15_000 });
    await expect(review.getByText('0手目')).toBeVisible({ timeout: 10_000 });

    // 既定では生徒は打てない（読み取り専用の盤には着手用のマス目が無い）
    await expect(studentPage.getByTestId('go-board')).toBeVisible({ timeout: 15_000 });
    await expect(studentPage.getByTestId('go-board').locator('[data-cell]')).toHaveCount(0);

    // 先生が「打たせる」を押すと、生徒側に「打てます」が出る
    // （碁盤の道具列にも「着手」ボタンがあるので、生徒行のボタンは testid で指す）
    const permissionButton = review.getByTestId(`review-permission-sid:${TEST_STUDENT_A.id}`);
    await expect(permissionButton).toBeVisible({ timeout: 10_000 });
    await permissionButton.click();
    await expect(studentPage.getByText('打てます')).toBeVisible({ timeout: 10_000 });

    // 生徒の手が先生の盤に入り、生徒の盤にも返ってくる
    await studentPage.getByTestId('go-board').locator('[data-cell="4-4"]').click({ timeout: 10_000 });
    await expect(review.getByText('1手目')).toBeVisible({ timeout: 10_000 });
    await expect(studentPage.getByText('1手目')).toBeVisible({ timeout: 10_000 });

    // 許可を外すと打てなくなる
    await permissionButton.click();
    await expect(studentPage.getByText('打てます')).toHaveCount(0, { timeout: 10_000 });
    await expect(studentPage.getByTestId('go-board').locator('[data-cell]')).toHaveCount(0);
    await expect(review.getByText('1手目')).toBeVisible();
  });
});
