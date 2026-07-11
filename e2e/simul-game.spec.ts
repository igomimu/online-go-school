import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { TEST_STUDENT_A, TEST_STUDENT_B, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupClassroomData, setupTeacherPassword, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher, openClassroomAndConnect, waitForObserverPanel, waitForStudentJoined } from './helpers/teacher-actions';
import { enterAssignedGame, loginAsStudent, playMove, waitForMyTurn } from './helpers/student-actions';

async function openSimulGrid(page: Page): Promise<void> {
  await page.getByRole('button', { name: '多面打ち', exact: true }).click();
  await expect(page.getByText('多面打ち').first()).toBeVisible({ timeout: 10_000 });
}

async function addSimulGame(page: Page, studentName: string): Promise<void> {
  await page.getByRole('button', { name: '対局を追加', exact: true }).first().click();
  await page.getByText('多面打ち - 対局を追加').waitFor({ timeout: 5_000 });
  const select = page.getByTestId('simul-student-select');
  const options = await select.locator('option').allTextContents();
  const index = options.findIndex((text) => text.includes(studentName));
  if (index < 0) throw new Error(`多面追加候補に ${studentName} が見つからない: ${JSON.stringify(options)}`);
  await select.selectOption({ index });
  await page.getByRole('button', { name: '9路', exact: true }).click();
  await page.getByRole('button', { name: '追加', exact: true }).click();
  await expect(page.getByText('多面打ち - 対局を追加')).toBeHidden({ timeout: 10_000 });
}

function simulTile(page: Page, studentName: string) {
  return page.getByRole('button', { name: new RegExp(`${studentName}.*\\d+手目`) });
}

test.describe('多面打ち', () => {
  let teacherContext: BrowserContext;
  let studentAContext: BrowserContext;
  let studentBContext: BrowserContext;
  let teacherPage: Page;
  let studentAPage: Page;
  let studentBPage: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('simul');
    teacherContext = await browser.newContext();
    studentAContext = await browser.newContext();
    studentBContext = await browser.newContext();
    teacherPage = await teacherContext.newPage();
    studentAPage = await studentAContext.newPage();
    studentBPage = await studentBContext.newPage();

    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.reload();

    await studentAPage.goto('/');
    await clearAllData(studentAPage);
    await setupClassroomData(studentAPage, classroomId);
    await studentAPage.reload();

    await studentBPage.goto('/');
    await clearAllData(studentBPage);
    await setupClassroomData(studentBPage, classroomId);
    await studentBPage.reload();
  });

  test.afterEach(async () => {
    await teacherContext?.close();
    await studentAContext?.close();
    await studentBContext?.close();
    if (classroomId) await teardownSupabaseRoster(classroomId);
  });

  test('先生が1局ずつ追加し、手番盤を開いて自動で多面グリッドへ戻る', async () => {
    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);

    await Promise.all([
      loginAsStudent(studentAPage, { studentCode: TEST_STUDENT_A.code, classroomId }),
      loginAsStudent(studentBPage, { studentCode: TEST_STUDENT_B.code, classroomId }),
    ]);
    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);
    await waitForStudentJoined(teacherPage, TEST_STUDENT_B.id);

    await openSimulGrid(teacherPage);
    await addSimulGame(teacherPage, TEST_STUDENT_A.name);
    await expect(teacherPage.getByRole('button', { name: '閉じてホーム' })).toHaveCount(0);
    await expect(simulTile(teacherPage, TEST_STUDENT_A.name)).toBeVisible({ timeout: 10_000 });

    await addSimulGame(teacherPage, TEST_STUDENT_B.name);
    await expect(simulTile(teacherPage, TEST_STUDENT_B.name)).toBeVisible({ timeout: 10_000 });
    await expect(teacherPage.getByText('0手目')).toHaveCount(2);

    await Promise.all([
      enterAssignedGame(studentAPage),
      enterAssignedGame(studentBPage),
    ]);

    await waitForMyTurn(studentAPage);
    await playMove(studentAPage, 4, 4);
    await expect(studentAPage.locator('[data-stone="4-4"]')).toBeVisible({ timeout: 10_000 });
    await expect(teacherPage.locator('[data-stone="4-4"]')).toBeVisible({ timeout: 10_000 });
    await expect(teacherPage.getByText('あなたの番')).toBeVisible({ timeout: 10_000 });

    await teacherPage.getByRole('button', { name: '次の手番の盤へ' }).click();
    await waitForObserverPanel(teacherPage);
    await waitForMyTurn(teacherPage);
    await playMove(teacherPage, 5, 5);
    await expect(teacherPage.getByText('多面打ち').first()).toBeVisible({ timeout: 10_000 });

    await simulTile(teacherPage, TEST_STUDENT_B.name).click();
    await waitForObserverPanel(teacherPage);
    await teacherPage.getByRole('button', { name: '閉じてホーム' }).click();
    await expect(teacherPage.getByText('多面打ち').first()).toBeVisible({ timeout: 10_000 });

    await expect(studentAPage.getByTestId('go-board')).toBeVisible();
    await expect(studentBPage.getByTestId('go-board')).toBeVisible();
  });
});
