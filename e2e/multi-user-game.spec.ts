import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { TEST_STUDENT_A, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
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

test.describe('マルチユーザー対局フロー', () => {
  let teacherContext: BrowserContext;
  let studentContext: BrowserContext;
  let teacherPage: Page;
  let studentPage: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('single');
    teacherContext = await browser.newContext();
    studentContext = await browser.newContext();
    teacherPage = await teacherContext.newPage();
    studentPage = await studentContext.newPage();

    // 先生側セットアップ
    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.reload();

    // 生徒側セットアップ
    await studentPage.goto('/');
    await clearAllData(studentPage);
    await setupClassroomData(studentPage, classroomId);
    await studentPage.reload();
  });

  test.afterEach(async () => {
    await teacherContext?.close();
    await studentContext?.close();
  });

  test('先生が対局作成 → 生徒が参加 → 着手が同期される', async () => {
    // 先生ログイン & 教室接続
    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);

    // 生徒ログイン
    await loginAsStudent(studentPage, {
      studentId: TEST_STUDENT_A.id,
      classroomId,
    });

    // 先生側で生徒AのLiveKit接続を確認
    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);

    // 対局作成: 生徒A(黒) vs 先生(白)
    await createGame(teacherPage, {
      blackName: TEST_STUDENT_A.name,
      whiteName: '先生',
      boardSize: 9,
      expectedPlayersCount: 2, // 先生 + 生徒1
    });

    // 生徒が対局画面に遷移
    await enterAssignedGame(studentPage);

    // 生徒(黒)の番
    await waitForMyTurn(studentPage);

    // (5,5) に着手
    await playMove(studentPage, 5, 5);

    // 石が表示され手数が進む
    await expect(studentPage.locator('[data-stone="5-5"]')).toBeVisible({ timeout: 10_000 });
    await expect(studentPage.getByTestId('move-count')).toContainText('1手目');
  });
});
