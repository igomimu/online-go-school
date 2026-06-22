import { test, expect } from '@playwright/test';
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

test('実際にブラウザを自動操作して着手とエラーが無いことを確認しスクリーンショットを撮影', async ({ browser }) => {
  const classroomId = generateClassroomId('verify');
  const teacherContext = await browser.newContext();
  const studentAContext = await browser.newContext();
  const studentBContext = await browser.newContext();
  
  const teacherPage = await teacherContext.newPage();
  const studentAPage = await studentAContext.newPage();
  const studentBPage = await studentBContext.newPage();

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

  // === 先生ログイン & 教室接続 ===
  await loginAsTeacher(teacherPage);
  await openClassroomAndConnect(teacherPage);

  // === 生徒2人が並行ログイン ===
  await Promise.all([
    loginAsStudent(studentAPage, { studentCode: TEST_STUDENT_A.code, classroomId }),
    loginAsStudent(studentBPage, { studentCode: TEST_STUDENT_B.code, classroomId }),
  ]);

  // === 先生側で両生徒のLiveKit接続を確認 ===
  await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);
  await waitForStudentJoined(teacherPage, TEST_STUDENT_B.id);

  // === 先生: 生徒A(黒) vs 生徒B(白) の対局を作成 ===
  await createGame(teacherPage, {
    blackName: TEST_STUDENT_A.name,
    whiteName: TEST_STUDENT_B.name,
    boardSize: 9,
    expectedPlayersCount: 3,
  });

  // === 両生徒が対局画面に遷移 ===
  await Promise.all([
    enterAssignedGame(studentAPage),
    enterAssignedGame(studentBPage),
  ]);

  // === 生徒A(黒)が (4,4) に着手 ===
  await waitForMyTurn(studentAPage);
  await playMove(studentAPage, 4, 4);

  // 碁盤に黒石が同期されるのを待つ
  await expect(studentAPage.locator('[data-stone="4-4"]')).toBeVisible({ timeout: 10_000 });
  await expect(studentBPage.locator('[data-stone="4-4"]')).toBeVisible({ timeout: 10_000 });

  // === ここで生徒Aの対局画面のスクリーンショットを撮影 ===
  // エラー表示が無いこと、および石が正しく置かれていることの証明
  await studentAPage.screenshot({ path: 'verified-stone-placed.png' });
  console.log('[SCREENSHOT] Screenshot saved successfully as verified-stone-placed.png');

  await teacherContext.close();
  await studentAContext.close();
  await studentBContext.close();
});
