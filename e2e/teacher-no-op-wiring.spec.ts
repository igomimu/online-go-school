import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { TEST_STUDENT_A, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import {
  loginAsTeacher,
  openClassroomAndConnect,
  waitForStudentJoined,
  createGame,
  clickReconnectAndWaitCycle,
  getOpenStudentButton,
  waitForSimulBoard,
  closeSimulToHome,
} from './helpers/teacher-actions';
import { loginAsStudent } from './helpers/student-actions';

/**
 * 「UIだけ no-op」から実機能に配線した周回(回線復旧 / StudentTable 開く)の
 * 実機駆動検証。multi-user-game.spec.ts とは別ファイルにすることで
 * 同 spec 内テスト間の LiveKit room state 干渉を避ける。
 *
 * 第3周(AI候補手クリック)は KataGo モックを使うので review-ai-highlight.spec.ts に独立。
 */
test.describe('TeacherToolbar / StudentTable 配線検証', () => {
  let teacherContext: BrowserContext;
  let studentContext: BrowserContext;
  let teacherPage: Page;
  let studentPage: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('wiring');
    teacherContext = await browser.newContext();
    studentContext = await browser.newContext();
    teacherPage = await teacherContext.newPage();
    studentPage = await studentContext.newPage();

    teacherPage.on('console', msg => console.log(`[Teacher Console] ${msg.type()}: ${msg.text()}`));
    teacherPage.on('pageerror', err => console.error('[Teacher Page Error]', err));
    studentPage.on('console', msg => console.log(`[Student Console] ${msg.type()}: ${msg.text()}`));
    studentPage.on('pageerror', err => console.error('[Student Page Error]', err));

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
    if (classroomId) {
      await teardownSupabaseRoster(classroomId);
    }
  });

  test('「開く」ボタン: 対局なしでは disabled、対局作成後にアクティブ化→観戦パネルに遷移', async () => {
    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);

    await loginAsStudent(studentPage, {
      studentCode: TEST_STUDENT_A.code,
      classroomId,
    });
    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);

    // 対局なし状態では「開く」が disabled
    const openButton = getOpenStudentButton(teacherPage, TEST_STUDENT_A.id);
    await expect(openButton).toBeVisible();
    await expect(openButton).toBeDisabled();

    // 対局作成
    await createGame(teacherPage, {
      blackName: TEST_STUDENT_A.name,
      whiteName: '先生',
      boardSize: 9,
      expectedPlayersCount: 2,
    });

    // 先生自身が対局者なので多面打ちビューで盤が自動で開く → 戻るでダッシュボードに戻る
    await waitForSimulBoard(teacherPage);
    await closeSimulToHome(teacherPage);

    // 対局作成後、行の gameStatus が playing になり「開く」がアクティブ化
    await expect(openButton).toBeEnabled({ timeout: 15_000 });

    // クリック → 先生自身の対局なので多面打ちビューに遷移
    await openButton.click();
    await waitForSimulBoard(teacherPage);
  });

  test('「回線復旧」ボタン: クリック→復旧中ラベル+disabled→数秒で復旧', async () => {
    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);

    // 生徒も接続させて、reconnect 前後でルームが活きていることを確かめやすくする
    await loginAsStudent(studentPage, {
      studentCode: TEST_STUDENT_A.code,
      classroomId,
    });
    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);

    // 回線復旧: ラベル変化 → 完了して元に戻ることを検証
    await clickReconnectAndWaitCycle(teacherPage);

    // 復旧後も生徒接続が回復していること（ヘッダの「1人接続中」で確認）
    await expect(teacherPage.getByText('1人接続中')).toBeVisible({ timeout: 20_000 });
  });
});
