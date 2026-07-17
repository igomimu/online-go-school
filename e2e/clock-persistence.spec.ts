import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { TEST_STUDENT_A, TEST_STUDENT_B, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher, openClassroomAndConnect, waitForStudentJoined, createGame } from './helpers/teacher-actions';
import { loginAsStudent, enterAssignedGame, waitForMyTurn, playMove } from './helpers/student-actions';

// 回帰テスト: 「1手打つと持ち時間が初期値に戻る」バグ（2026-07-10修正）。
// 白番(生徒B)が数秒消費して着手した後、白の持ち時間が 10:00 に巻き戻らず
// 消費後の値が相手(生徒A)の画面にも永続することを確認する。

test('着手後に消費した持ち時間が巻き戻らない', async ({ browser }) => {
  test.setTimeout(120_000);
  const classroomId = generateClassroomId('clockverify');
  const contexts: BrowserContext[] = [];
  const newPage = async (): Promise<Page> => {
    const ctx = await browser.newContext();
    contexts.push(ctx);
    return ctx.newPage();
  };

  const teacherPage = await newPage();
  const studentAPage = await newPage();
  const studentBPage = await newPage();

  try {
    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.reload();

    for (const p of [studentAPage, studentBPage]) {
      await p.goto('/');
      await clearAllData(p);
      await setupClassroomData(p, classroomId);
      await p.reload();
    }

    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);
    await Promise.all([
      loginAsStudent(studentAPage, { studentCode: TEST_STUDENT_A.code, classroomId }),
      loginAsStudent(studentBPage, { studentCode: TEST_STUDENT_B.code, classroomId }),
    ]);
    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);
    await waitForStudentJoined(teacherPage, TEST_STUDENT_B.id);

    // 持ち時間消費の永続化を検証したいので明示的に10分を指定
    // （DEFAULT_TIME_SETTINGSは持ち時間0分・秒読み30秒×1のため、指定しないと本テストの意図が成立しない）
    await createGame(teacherPage, {
      blackName: TEST_STUDENT_A.name,
      whiteName: TEST_STUDENT_B.name,
      boardSize: 9,
      expectedPlayersCount: 3,
      mainMinutes: 10,
    });

    await Promise.all([enterAssignedGame(studentAPage), enterAssignedGame(studentBPage)]);

    // 黒(A)が1手 → 時計が動き出す（lastTickTime設定）
    await waitForMyTurn(studentAPage);
    await playMove(studentAPage, 4, 4);
    await expect(studentBPage.locator('[data-stone="4-4"]')).toBeVisible({ timeout: 10_000 });

    // 白(B)が5秒ほど消費してから着手
    await waitForMyTurn(studentBPage);
    await studentBPage.waitForTimeout(5_000);
    await playMove(studentBPage, 5, 5);
    await expect(studentAPage.locator('[data-stone="5-5"]')).toBeVisible({ timeout: 10_000 });

    // Realtimeのclock行更新が確実に届いてから（=ローカルtick表示ではなく永続値を）検証する。
    // 手番は黒に移っているので白の時計は凍結値＝サーバーに書かれた値。
    await studentAPage.waitForTimeout(4_000);
    // バグがあると 10:00 に巻き戻る。修正後は消費5秒が永続して 9:5x。
    await expect(studentAPage.getByTestId('clock-white')).toHaveText(/^9:5\d$/);
    await expect(studentBPage.getByTestId('clock-white')).toHaveText(/^9:5\d$/);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await teardownSupabaseRoster(classroomId);
  }
});
