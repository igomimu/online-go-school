import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { TEST_STUDENT_A, TEST_STUDENT_B, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupClassroomData, setupTeacherPassword, teardownSupabaseRoster } from './helpers/setup';
import { createGame, loginAsTeacher, openClassroomAndConnect, waitForStudentJoined } from './helpers/teacher-actions';
import { enterAssignedGame, loginAsStudent, playMove, waitForMyTurn } from './helpers/student-actions';

test.describe('合法手判定', () => {
  let teacherContext: BrowserContext;
  let studentAContext: BrowserContext;
  let studentBContext: BrowserContext;
  let teacherPage: Page;
  let studentAPage: Page;
  let studentBPage: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('legality');
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

    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);
    await Promise.all([
      loginAsStudent(studentAPage, { studentCode: TEST_STUDENT_A.code, classroomId }),
      loginAsStudent(studentBPage, { studentCode: TEST_STUDENT_B.code, classroomId }),
    ]);
    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);
    await waitForStudentJoined(teacherPage, TEST_STUDENT_B.id);
    await createGame(teacherPage, {
      blackName: TEST_STUDENT_A.name,
      whiteName: TEST_STUDENT_B.name,
      boardSize: 9,
      expectedPlayersCount: 3,
    });
    await Promise.all([
      enterAssignedGame(studentAPage),
      enterAssignedGame(studentBPage),
    ]);
  });

  test.afterEach(async () => {
    await teacherContext?.close();
    await studentAContext?.close();
    await studentBContext?.close();
    if (classroomId) await teardownSupabaseRoster(classroomId);
  });

  test('自殺手は手数を進めず、別の合法手は続けて打てる', async () => {
    await waitForMyTurn(studentAPage);
    await playMove(studentAPage, 2, 1);

    await waitForMyTurn(studentBPage);
    await playMove(studentBPage, 5, 5);

    await waitForMyTurn(studentAPage);
    await playMove(studentAPage, 1, 2);
    await expect(studentBPage.getByTestId('move-count')).toContainText('3手目', { timeout: 10_000 });

    await waitForMyTurn(studentBPage);
    await playMove(studentBPage, 1, 1);
    await studentBPage.waitForTimeout(500);
    await expect(studentBPage.locator('[data-stone="1-1"]')).toHaveCount(0);
    await expect(studentBPage.getByTestId('move-count')).toContainText('3手目');

    await playMove(studentBPage, 6, 6);
    await expect(studentBPage.getByTestId('move-count')).toContainText('4手目', { timeout: 10_000 });
  });

  test('コウの即取り返しは禁止され、コウ立て後は取り返せる', async () => {
    studentAPage.on('console', (msg) => console.log('[A]', msg.text()));
    studentBPage.on('console', (msg) => console.log('[B]', msg.text()));
    const sequence: Array<[Page, number, number]> = [
      [studentAPage, 3, 3],
      [studentBPage, 5, 2],
      [studentAPage, 4, 2],
      [studentBPage, 5, 4],
      [studentAPage, 4, 4],
      [studentBPage, 6, 3],
      [studentAPage, 5, 3],
      [studentBPage, 4, 3],
    ];

    for (const [page, x, y] of sequence) {
      await waitForMyTurn(page);
      await playMove(page, x, y);
    }
    await expect(studentAPage.getByTestId('move-count')).toContainText('8手目', { timeout: 10_000 });
    await expect(studentAPage.locator('[data-stone="5-3"]')).toHaveCount(0);

    await waitForMyTurn(studentAPage);
    await playMove(studentAPage, 5, 3);
    await studentAPage.waitForTimeout(500);
    await expect(studentAPage.locator('[data-stone="5-3"]')).toHaveCount(0);
    await expect(studentAPage.getByTestId('move-count')).toContainText('8手目');

    await playMove(studentAPage, 1, 1);
    await expect(studentAPage.getByTestId('move-count')).toContainText('9手目', { timeout: 10_000 });

    await waitForMyTurn(studentBPage);
    await playMove(studentBPage, 9, 9);
    await expect(studentBPage.getByTestId('move-count')).toContainText('10手目', { timeout: 10_000 });

    await waitForMyTurn(studentAPage);
    await playMove(studentAPage, 5, 3);
    await expect(studentAPage.getByTestId('move-count')).toContainText('11手目', { timeout: 10_000 });
    await expect(studentAPage.locator('[data-stone="5-3"]')).toBeVisible();
    await expect(studentAPage.locator('[data-stone="4-3"]')).toHaveCount(0);
  });
});
