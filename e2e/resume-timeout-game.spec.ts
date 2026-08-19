import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { TEST_STUDENT_A, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher, openClassroomAndConnect, waitForStudentJoined, waitForTeacherGameWindow } from './helpers/teacher-actions';
import { loginAsStudent, enterAssignedGame, waitForMyTurn, playMove } from './helpers/student-actions';
import { recordNotificationSounds, playedSounds } from './helpers/audio';

// 回線トラブルで生徒が時間切れ負けになった対局を、講師がその場から再開できること（2026-08-01）。
// 再開時は切れた側の時計（秒読み回数）が戻り、そのまま打ち続けられる必要がある。

test('時間切れで終わった対局を講師が再開でき、切れた側の時計が戻る', async ({ browser }) => {
  test.setTimeout(180_000);
  const classroomId = generateClassroomId('resume');
  const contexts: BrowserContext[] = [];
  const newPage = async (): Promise<Page> => {
    const ctx = await browser.newContext();
    contexts.push(ctx);
    return ctx.newPage();
  };

  const teacherPage = await newPage();
  const studentAPage = await newPage();

  try {
    await recordNotificationSounds(teacherPage);
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

    // 対局作成: 生徒A(黒) vs 先生(白)、持ち時間0・秒読み10秒×1
    await teacherPage.getByTestId('create-game-toolbar-button').click();
    await teacherPage.getByTestId('create-game-button').waitFor({ timeout: 5_000 });
    await teacherPage.getByRole('button', { name: '9路', exact: true }).click();

    const blackSelect = teacherPage.getByTestId('black-player-select');
    await expect(blackSelect.locator('option')).toHaveCount(2, { timeout: 20_000 });
    const options = await blackSelect.locator('option').allTextContents();
    await blackSelect.selectOption({ index: options.findIndex(o => o.includes(TEST_STUDENT_A.name)) });
    await teacherPage.getByTestId('white-player-select').selectOption({ index: options.findIndex(o => o.includes('先生')) });

    const numberInputs = teacherPage.locator('input[type="number"]');
    await numberInputs.nth(1).fill('0');
    await teacherPage.getByRole('button', { name: '10秒', exact: true }).click();
    await numberInputs.nth(2).fill('1'); // 秒読み10秒×1

    const teacherGameWindow = await waitForTeacherGameWindow(teacherPage, () =>
      teacherPage.getByTestId('create-game-button').click(),
    );
    teacherGameWindow.on('dialog', d => d.accept());

    // 黒(生徒A)→白(先生)と1手ずつ打つと、以降は黒(生徒A)の時計が動く
    await enterAssignedGame(studentAPage);
    await waitForMyTurn(studentAPage);
    await playMove(studentAPage, 4, 4);
    await playMove(teacherGameWindow, 6, 6);

    // 生徒Aは以降着手しないので 10秒×1 で時間切れ負け（W+T）
    await expect(teacherGameWindow.getByText('黒の時間切れ。白の勝ち')).toBeVisible({ timeout: 45_000 });

    // 教室ホームにも「誰の時間が切れたか」が出る（音と一緒。気づかないと対局が止まる 2026-08-05）
    const timeoutAlert = teacherPage.getByTestId('classroom-alert-timeout');
    await expect(timeoutAlert).toBeVisible({ timeout: 20_000 });
    await expect(timeoutAlert).toContainText(TEST_STUDENT_A.name);
    // 時間切れの音（高い3音の1音目 1046Hz）。接続切れ（440Hz）とは違う音にしてある
    await expect.poll(async () => (await playedSounds(teacherPage)).includes(1046), {
      timeout: 10_000,
    }).toBe(true);
    // 対局ウィンドウ側の再開ボタンも従来どおり出ている
    await expect(teacherGameWindow.getByTestId('resume-timeout-game')).toBeVisible();
    // 打っている最中でも気づけるよう、対局ウィンドウにも同じ知らせが出る
    const windowAlert = teacherGameWindow.getByTestId('classroom-alert-timeout');
    await expect(windowAlert).toBeVisible({ timeout: 15_000 });
    await expect(windowAlert).toContainText(TEST_STUDENT_A.name);

    // 講師がその知らせから対局を再開する
    await timeoutAlert.getByRole('button', { name: '対局を再開する' }).click();
    // 再開したら知らせは両方から消える
    await expect(teacherPage.getByTestId('classroom-alert-timeout')).toHaveCount(0, { timeout: 20_000 });
    await expect(teacherGameWindow.getByTestId('classroom-alert-timeout')).toHaveCount(0, { timeout: 20_000 });

    // 生徒側の盤が対局中に戻り、切れていた黒の秒読みが規定回数（1回）復元されている
    // 表示は「<秒読みの経過秒>秒 秒読み 残<回数>」（a64d46b でこの形になった）。
    // 経過秒は 0 から増えていくので、ここで見るべきは復元された回数のほう。
    await expect(studentAPage.getByTestId('clock-black')).toContainText('秒読み 残1', { timeout: 30_000 });
    await expect(studentAPage.getByText('あなたの番です')).toBeVisible({ timeout: 15_000 });
    await expect(studentAPage.getByText(/時間切れ/)).toHaveCount(0);

    // 再開後も打てる
    await playMove(studentAPage, 3, 3);
    await expect(studentAPage.getByTestId('move-count')).toContainText('3手目', { timeout: 15_000 });
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await teardownSupabaseRoster(classroomId);
  }
});
