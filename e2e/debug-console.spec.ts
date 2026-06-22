import { test } from '@playwright/test';
import { TEST_STUDENT_A, TEST_STUDENT_B, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { setupTeacherPassword, setupClassroomData, clearAllData } from './helpers/setup';
import { loginAsTeacher, openClassroomAndConnect, waitForStudentJoined, createGame } from './helpers/teacher-actions';
import { loginAsStudent, enterAssignedGame } from './helpers/student-actions';
import fs from 'fs';
import path from 'path';

const logs: string[] = [];

test.afterEach(async () => {
  const logPath = path.join(process.cwd(), 'console-debug.log');
  fs.writeFileSync(logPath, logs.join('\n'), 'utf-8');
  console.log(`[DEBUG] Debug logs successfully written to ${logPath}`);
});

test('本番URLでの対局作成時のコンソールエラーとAPIエラーをキャプチャするデバッグテスト', async ({ browser }) => {
  const classroomId = generateClassroomId('debugfull');
  
  const teacherContext = await browser.newContext();
  const studentAContext = await browser.newContext();
  const studentBContext = await browser.newContext();
  
  const teacherPage = await teacherContext.newPage();
  const studentAPage = await studentAContext.newPage();
  const studentBPage = await studentBContext.newPage();

  // ログキャプチャの設定 (先生ページ)
  teacherPage.on('console', (msg) => {
    logs.push(`[TEACHER_CONSOLE][${msg.type()}] ${msg.text()}`);
  });
  teacherPage.on('requestfailed', (request) => {
    logs.push(`[TEACHER_REQ_FAILED] ${request.method()} ${request.url()} - ${request.failure()?.errorText}`);
  });
  teacherPage.on('response', async (response) => {
    const status = response.status();
    if (status >= 400) {
      let bodyText = '';
      try {
        bodyText = await response.text();
      } catch {}
      logs.push(`[TEACHER_RESPONSE_ERR] ${response.request().method()} ${response.url()} -> Status ${status}: ${bodyText.substring(0, 500)}`);
    }
  });

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

  // 先生ログイン & 接続
  await loginAsTeacher(teacherPage);
  await openClassroomAndConnect(teacherPage);

  // 生徒2人ログイン
  await Promise.all([
    loginAsStudent(studentAPage, { studentCode: TEST_STUDENT_A.code, classroomId }),
    loginAsStudent(studentBPage, { studentCode: TEST_STUDENT_B.code, classroomId }),
  ]);

  // 接続確認
  await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);
  await waitForStudentJoined(teacherPage, TEST_STUDENT_B.id);

  // 対局作成を実行
  logs.push(`[DEBUG] Triggering createGame on teacherPage...`);
  await createGame(teacherPage, {
    blackName: TEST_STUDENT_A.name,
    whiteName: TEST_STUDENT_B.name,
    boardSize: 9,
    expectedPlayersCount: 3,
  });

  // 対局同期待ち (ここで失敗するはずなので、コンソールやレスポンスにエラーが残る)
  logs.push(`[DEBUG] Entering assigned game on studentAPage...`);
  await enterAssignedGame(studentAPage);

  await teacherContext.close();
  await studentAContext.close();
  await studentBContext.close();
});
