import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { TEST_STUDENT_A, TEST_STUDENT_B, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData } from './helpers/setup';
import {
  loginAsTeacher,
  openClassroomAndConnect,
  waitForStudentJoined,
  createGame,
} from './helpers/teacher-actions';
import {
  loginAsStudent,
  enterAssignedGame,
  waitForMyTurn,
  playMove,
} from './helpers/student-actions';

test.describe('先生1+生徒2 対局フルシナリオ', () => {
  let teacherContext: BrowserContext;
  let studentAContext: BrowserContext;
  let studentBContext: BrowserContext;
  let teacherPage: Page;
  let studentAPage: Page;
  let studentBPage: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('multi');
    teacherContext = await browser.newContext();
    studentAContext = await browser.newContext();
    studentBContext = await browser.newContext();
    teacherPage = await teacherContext.newPage();
    studentAPage = await studentAContext.newPage();
    studentBPage = await studentBContext.newPage();

    // 先生側セットアップ
    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.reload();

    // 生徒A側セットアップ
    await studentAPage.goto('/');
    await clearAllData(studentAPage);
    await setupClassroomData(studentAPage, classroomId);
    await studentAPage.reload();

    // 生徒B側セットアップ
    await studentBPage.goto('/');
    await clearAllData(studentBPage);
    await setupClassroomData(studentBPage, classroomId);
    await studentBPage.reload();
  });

  test.afterEach(async () => {
    await teacherContext?.close();
    await studentAContext?.close();
    await studentBContext?.close();
  });

  test('先生作成→生徒2人参加→相互着手→両者パス→整地モード突入', async () => {
    // コンソールログを収集（デバッグ用）
    teacherPage.on('console', (msg) => console.log('[TEACHER]', msg.text()));
    studentAPage.on('console', (msg) => console.log('[STUDENT_A]', msg.text()));
    studentBPage.on('console', (msg) => console.log('[STUDENT_B]', msg.text()));

    // === 先生ログイン & 教室接続 ===
    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);

    // === 生徒2人が並行ログイン ===
    await Promise.all([
      loginAsStudent(studentAPage, { studentId: TEST_STUDENT_A.id, classroomId }),
      loginAsStudent(studentBPage, { studentId: TEST_STUDENT_B.id, classroomId }),
    ]);

    // === 先生側で両生徒のLiveKit接続を確認 ===
    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);
    await waitForStudentJoined(teacherPage, TEST_STUDENT_B.id);

    // === 先生: 生徒A(黒) vs 生徒B(白) の対局を作成 ===
    // ここで既存fail (2026-03-26) と同じセレクト同期問題が再現するかを観測
    await createGame(teacherPage, {
      blackName: TEST_STUDENT_A.name,
      whiteName: TEST_STUDENT_B.name,
      boardSize: 9,
      expectedPlayersCount: 3, // 先生 + 生徒2
    });

    // === 両生徒が対局画面に遷移 ===
    await Promise.all([
      enterAssignedGame(studentAPage),
      enterAssignedGame(studentBPage),
    ]);

    // === 生徒A(黒)が (4,4) に着手 ===
    await waitForMyTurn(studentAPage);
    await playMove(studentAPage, 4, 4);

    // 両者の碁盤に黒石が同期される
    await expect(studentAPage.locator('[data-stone="4-4"]')).toBeVisible({ timeout: 10_000 });
    await expect(studentBPage.locator('[data-stone="4-4"]')).toBeVisible({ timeout: 10_000 });

    // === 生徒B(白)が (5,5) に着手 ===
    await waitForMyTurn(studentBPage);
    await playMove(studentBPage, 5, 5);

    await expect(studentAPage.locator('[data-stone="5-5"]')).toBeVisible({ timeout: 10_000 });
    await expect(studentBPage.locator('[data-stone="5-5"]')).toBeVisible({ timeout: 10_000 });

    // 手数カウンタが両方で「2手目」
    await expect(studentAPage.getByTestId('move-count')).toContainText('2手目');
    await expect(studentBPage.getByTestId('move-count')).toContainText('2手目');

    // === 両者パス → 整地モード ===
    // 生徒A（黒）のターン
    await waitForMyTurn(studentAPage);
    await studentAPage.getByRole('button', { name: /パス/ }).click();

    // 生徒B（白）のターン
    await waitForMyTurn(studentBPage);
    await studentBPage.getByRole('button', { name: /パス/ }).click();

    // 整地モード突入: move-count表示が「整地中」に切り替わる
    await expect(studentAPage.getByTestId('move-count')).toContainText('整地中', { timeout: 10_000 });
    await expect(studentBPage.getByTestId('move-count')).toContainText('整地中', { timeout: 10_000 });
  });
});
