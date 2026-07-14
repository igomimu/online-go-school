import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { TEST_STUDENT_A, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupClassroomData, setupTeacherPassword, teardownSupabaseRoster } from './helpers/setup';
import { createGame, loginAsTeacher, openClassroomAndConnect, waitForTeacherGameWindow, waitForStudentJoined } from './helpers/teacher-actions';
import { enterAssignedGame, loginAsStudent, playMove, waitForMyTurn } from './helpers/student-actions';

// 回帰テスト: 講師の対局別ウィンドウに生徒の着手が反映されない（2026-07-11修正）。
// 真因=セッション復元前のRealtime購読はRLSで弾かれ、以後イベントが届かない（ensureRealtimeAuth参照）。
// 2026-07-15以降、講師の対局は常に別ウィンドウで自動オープンする設計になったため、
// 「多面打ちビュー→手動で別ウィンドウボタン」という旧手順は発生しなくなり、
// 対局作成が直接この別ウィンドウを誘発する形になった。

test('講師の別ウィンドウ碁盤に生徒の着手が反映される', async ({ browser }) => {
  test.setTimeout(120_000);
  const classroomId = generateClassroomId('popup');
  const contexts: BrowserContext[] = [];
  const newPage = async (): Promise<Page> => {
    const ctx = await browser.newContext();
    contexts.push(ctx);
    return ctx.newPage();
  };

  const teacherPage = await newPage();
  const studentAPage = await newPage();

  try {
    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.reload();

    await studentAPage.goto('/');
    await clearAllData(studentAPage);
    await setupClassroomData(studentAPage, classroomId);
    await studentAPage.reload();

    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);
    await loginAsStudent(studentAPage, { studentCode: TEST_STUDENT_A.code, classroomId });
    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);

    // 対局作成 → 先生は対局者なので講師専用の別ウィンドウが自動で開く
    const popup = await waitForTeacherGameWindow(teacherPage, () =>
      createGame(teacherPage, {
        blackName: TEST_STUDENT_A.name,
        whiteName: '先生',
        boardSize: 9,
        expectedPlayersCount: 2,
      }),
    );
    popup.on('console', (msg) => console.log('[POPUP]', msg.type(), msg.text().slice(0, 200)));
    await expect(popup.getByTestId('go-board')).toBeVisible({ timeout: 15_000 });

    // 生徒Aが初手を打つ
    await enterAssignedGame(studentAPage);
    await waitForMyTurn(studentAPage);
    await playMove(studentAPage, 4, 4);
    await expect(studentAPage.locator('[data-stone="4-4"]')).toBeVisible({ timeout: 10_000 });

    // 別ウィンドウに石が反映されるか（報告バグ: 反映されない）
    await expect(popup.locator('[data-stone="4-4"]')).toBeVisible({ timeout: 15_000 });
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await teardownSupabaseRoster(classroomId);
  }
});
