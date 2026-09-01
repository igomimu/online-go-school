import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import {
  TEST_STUDENT_A,
  TEST_STUDENT_B,
  TEST_TEACHER_PASSWORD,
  generateClassroomId,
} from './helpers/test-data';
import {
  clearAllData,
  setupTeacherPassword,
  setupClassroomData,
  teardownSupabaseRoster,
} from './helpers/setup';
import {
  loginAsTeacher,
  openClassroomAndConnect,
  waitForStudentJoined,
  createGame,
  getStudentBoard,
  waitForObserverPanel,
  closeGameBoardToHome,
} from './helpers/teacher-actions';
import { loginAsStudent, enterAssignedGame, playMove, waitForMyTurn } from './helpers/student-actions';

/**
 * 中断した対局は「棋譜履歴の一件」として扱う（2026-08-27 三村さんの指定）。
 *
 * これまで中断局は進行中の対局と同じ扱いで残り、生徒リストの碁盤に居座って
 * 同じ相手の新しい対局が埋もれていた。生徒のロビーにも再開ボタンが出ていた。
 *
 * 決まり:
 *   - 進行中の場所（生徒リストの碁盤・生徒のロビー）には出さない
 *   - 棋譜履歴に「中断中」として並ぶ
 *   - 再開できるのは講師だけ。履歴から行う
 *   - 中断局があっても、同じ2人で新しい対局を始められる
 */
test.describe('中断した対局の扱い', () => {
  let teacherContext: BrowserContext;
  let studentAContext: BrowserContext;
  let studentBContext: BrowserContext;
  let teacherPage: Page;
  let studentAPage: Page;
  let studentBPage: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('int');
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
    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);

    await Promise.all([
      loginAsStudent(studentAPage, { studentCode: TEST_STUDENT_A.code, classroomId }),
      loginAsStudent(studentBPage, { studentCode: TEST_STUDENT_B.code, classroomId }),
    ]);
    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);
    await waitForStudentJoined(teacherPage, TEST_STUDENT_B.id);
  });

  test.afterEach(async () => {
    await teacherContext?.close();
    await studentAContext?.close();
    await studentBContext?.close();
    if (classroomId) await teardownSupabaseRoster(classroomId);
  });

  test('中断すると進行中の碁盤から消え、履歴に「中断中」で残り、講師だけが再開できる', async () => {
    // --- 対局を作って一手打つ ---
    await createGame(teacherPage, {
      blackName: TEST_STUDENT_A.name,
      whiteName: TEST_STUDENT_B.name,
      boardSize: 9,
      expectedPlayersCount: 3,
    });

    const board = getStudentBoard(teacherPage, TEST_STUDENT_A.id);
    await expect(board).toBeVisible({ timeout: 15_000 });
    await board.click();
    await waitForObserverPanel(teacherPage);

    await Promise.all([enterAssignedGame(studentAPage), enterAssignedGame(studentBPage)]);
    await waitForMyTurn(studentAPage);
    await playMove(studentAPage, 4, 4);
    await expect(studentBPage.getByTestId('move-count')).toContainText('1手目', { timeout: 15_000 });

    // --- 講師が中断する ---
    await closeGameBoardToHome(teacherPage);
    teacherPage.on('dialog', (d) => d.accept());
    await teacherPage.getByTestId(`interrupt-game-${TEST_STUDENT_A.id}`).click();

    // --- 進行中の場所から消える ---
    // 生徒リストの碁盤に中断局は残らない（対局が無い状態の枠に戻る）
    await expect(async () => {
      const stillThere = await getStudentBoard(teacherPage, TEST_STUDENT_A.id).count();
      expect(stillThere).toBe(0);
    }).toPass({ timeout: 25_000 });

    // 生徒のロビーに「中断された対局があります」は出さない
    await expect(studentAPage.getByText('中断された対局があります')).toHaveCount(0);
    await expect(studentAPage.getByText('対局を再開する')).toHaveCount(0);

    // --- 中断局があっても、同じ2人で新しい対局を作れる ---
    await createGame(teacherPage, {
      blackName: TEST_STUDENT_A.name,
      whiteName: TEST_STUDENT_B.name,
      boardSize: 9,
      expectedPlayersCount: 3,
    });
    await expect(getStudentBoard(teacherPage, TEST_STUDENT_A.id)).toBeVisible({ timeout: 20_000 });
    // 講師一覧に新しい盤が出るだけでは不十分。実運用では、生徒側が中断局から
    // 新しい対局へ切り替わらず、碁盤が開かなかった。
    await Promise.all([enterAssignedGame(studentAPage), enterAssignedGame(studentBPage)]);

    // --- 棋譜履歴に「中断中」で並び、再開と削除ができる ---
    const row = teacherPage.locator(`tr[data-student-id="${TEST_STUDENT_A.id}"]`).first();
    await row.getByRole('button', { name: '履歴' }).click();
    await expect(teacherPage.getByText(/棋譜履歴 -/)).toBeVisible({ timeout: 15_000 });

    await expect(teacherPage.getByText('中断中').first()).toBeVisible({ timeout: 20_000 });
    await expect(teacherPage.getByRole('button', { name: '検討' }).first()).toBeVisible();
    await expect(teacherPage.getByRole('button', { name: '再開' }).first()).toBeVisible();
    await expect(teacherPage.getByRole('button', { name: '削除' }).first()).toBeVisible();
  });

  test('生徒の棋譜履歴には中断局が並ぶが、再開ボタンは出さない', async () => {
    await createGame(teacherPage, {
      blackName: TEST_STUDENT_A.name,
      whiteName: TEST_STUDENT_B.name,
      boardSize: 9,
      expectedPlayersCount: 3,
    });

    const board = getStudentBoard(teacherPage, TEST_STUDENT_A.id);
    await expect(board).toBeVisible({ timeout: 15_000 });
    await board.click();
    await waitForObserverPanel(teacherPage);

    await Promise.all([enterAssignedGame(studentAPage), enterAssignedGame(studentBPage)]);
    await waitForMyTurn(studentAPage);
    await playMove(studentAPage, 4, 4);
    await expect(studentBPage.getByTestId('move-count')).toContainText('1手目', { timeout: 15_000 });

    await closeGameBoardToHome(teacherPage);
    teacherPage.on('dialog', (d) => d.accept());
    await teacherPage.getByTestId(`interrupt-game-${TEST_STUDENT_A.id}`).click();

    // 生徒の画面に自分の棋譜履歴が出る。中断局は「中断中」で並ぶが、再開はできない
    await expect(async () => {
      await studentAPage.reload();
      await expect(studentAPage.getByText('自分の棋譜履歴')).toBeVisible({ timeout: 20_000 });
      await expect(studentAPage.getByText('中断中').first()).toBeVisible({ timeout: 10_000 });
    }).toPass({ timeout: 60_000 });

    await expect(studentAPage.getByRole('button', { name: '再開' })).toHaveCount(0);
  });
});
