import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { TEST_STUDENT_A, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher, loadSgfForReview, openClassroomAndConnect, waitForStudentJoined } from './helpers/teacher-actions';
import { loginAsStudent } from './helpers/student-actions';

const MOCK_RESPONSE = {
  winrate: 63.7,
  scoreLead: 4.1,
  topMoves: [
    { move: 'D4', winrate: 63.7, scoreLead: 4.1, visits: 1000, pv: ['D4', 'E5', 'F6'] },
    { move: 'G5', winrate: 58.2, scoreLead: 2.6, visits: 800, pv: ['G5', 'C3'] },
  ],
};

async function mockKatagoApi(page: Page): Promise<void> {
  await page.route('**/api/katago-analyze', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(MOCK_RESPONSE),
  }));
}

test.describe('検討モード AI先生→生徒同期', () => {
  let teacherContext: BrowserContext;
  let studentContext: BrowserContext;
  let teacherPage: Page;
  let studentPage: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('review-ai-sync');
    teacherContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    studentContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    teacherPage = await teacherContext.newPage();
    studentPage = await studentContext.newPage();

    await mockKatagoApi(teacherPage);
    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.evaluate(() => localStorage.setItem('go-school-ai-settings', JSON.stringify({ maxVisits: 100, enabled: true })));
    await teacherPage.reload();
    await mockKatagoApi(teacherPage);

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

  test('先生の候補手・勝率・PVが生徒画面にも表示される', async () => {
    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);
    await loginAsStudent(studentPage, { studentCode: TEST_STUDENT_A.code, classroomId });
    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);

    await loadSgfForReview(teacherPage, '(;FF[4]GM[1]SZ[9];B[ee])');

    await expect(studentPage.getByText('検討モード')).toBeVisible({ timeout: 15_000 });
    await expect(studentPage.getByTestId('ai-state')).toHaveText('ON', { timeout: 15_000 });
    await expect(studentPage.getByTestId('ai-candidate-0')).toBeVisible({ timeout: 15_000 });
    await expect(studentPage.getByTestId('ai-move-0')).toContainText('D4');
    await expect(studentPage.getByTestId('ai-move-0')).toContainText('63.7%');

    await studentPage.getByTestId('ai-move-0').hover();
    await expect(studentPage.getByTestId('pv-stone-1')).toBeVisible();
    await expect(studentPage.getByTestId('pv-stone-2')).toBeVisible();
    await expect(studentPage.getByTestId('pv-stone-3')).toBeVisible();
  });
});
