import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { TEST_STUDENT_A, TEST_STUDENT_B, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher, openClassroomAndConnect, waitForStudentJoined, createGame, getStudentBoard, waitForObserverPanel } from './helpers/teacher-actions';
import { loginAsStudent, enterAssignedGame, waitForMyTurn, playMove } from './helpers/student-actions';

// 投了は結果が一瞬で決まり碁盤も自動で閉じるため、結果を声と大きな表示で伝える（2026-08-02）。
declare global {
  interface Window { __spokenPhrases: string[] }
}

test('投了すると「〇の中押し勝ちです」と読み上げ、結果がはっきり表示される', async ({ browser }) => {
  test.setTimeout(150_000);
  const classroomId = generateClassroomId('resign');
  const ctxs: BrowserContext[] = [];
  const newPage = async (recordSpeech = false): Promise<Page> => {
    const ctx = await browser.newContext();
    ctxs.push(ctx);
    const page = await ctx.newPage();
    if (recordSpeech) {
      await page.addInitScript(() => {
        window.__spokenPhrases = [];
        let speaking = false;
        Object.defineProperty(window, 'speechSynthesis', {
          value: {
            speak(u: SpeechSynthesisUtterance) { window.__spokenPhrases.push(u.text); speaking = true; },
            cancel() { speaking = false; /* 記録は消さない */ },
            // 終局の読み上げは「始まっていなければ一度だけ言い直す」ので、
            // 実ブラウザと同じく発話中かどうかを返す（言い直しの空振りを作らない）
            get speaking() { return speaking; },
            get pending() { return false; },
          },
          configurable: true,
        });
      });
    }
    return page;
  };

  const teacherPage = await newPage();
  const aPage = await newPage(true);   // 黒（勝つ側）: ここで読み上げを記録する
  const bPage = await newPage();       // 白（投了する側）

  try {
    for (const p of [teacherPage, aPage, bPage]) { await p.goto('/'); await clearAllData(p); await setupClassroomData(p, classroomId); }
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    for (const p of [teacherPage, aPage, bPage]) await p.reload();

    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);
    await loginAsStudent(aPage, { studentCode: TEST_STUDENT_A.code, classroomId });
    await loginAsStudent(bPage, { studentCode: TEST_STUDENT_B.code, classroomId });
    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);
    await waitForStudentJoined(teacherPage, TEST_STUDENT_B.id);

    await createGame(teacherPage, {
      blackName: TEST_STUDENT_A.name,
      whiteName: TEST_STUDENT_B.name,
      boardSize: 9,
      expectedPlayersCount: 3,
    });
    const openBtn = getStudentBoard(teacherPage, TEST_STUDENT_A.id);
    await expect(openBtn).toBeVisible({ timeout: 10_000 });
    await openBtn.click();
    await waitForObserverPanel(teacherPage);

    await enterAssignedGame(aPage);
    await enterAssignedGame(bPage);

    // 黒(A)が打ち、白(B)の手番で投了する
    await waitForMyTurn(aPage);
    await playMove(aPage, 4, 4);
    await waitForMyTurn(bPage);
    bPage.on('dialog', d => d.accept());
    await bPage.getByRole('button', { name: /投了/ }).click();

    // 勝った側の画面に結果がはっきり出る（大きな結果パネル）
    const banner = aPage.getByTestId('game-result-banner');
    await expect(banner).toBeVisible({ timeout: 15_000 });
    await expect(banner).toContainText('白が投了しました。黒の中押し勝ち');
    await expect(aPage.getByTestId('game-result-close')).toBeVisible();

    // 声でも結果を伝える。
    // 読点で語を区切ってアクセントを頭に来させる（三村さん指定）。
    // 発話は cancel の直後を避けて少し置いてから始まるので、届くまで待つ。
    await expect.poll(
      () => aPage.evaluate(() => window.__spokenPhrases),
      { timeout: 10_000, message: '終局の読み上げが届かない' },
    ).toContain('黒、ちゅうおしがちです');

    // 言い直しは発話が始まらなかったときだけ。二重に喋らない
    const spoken = await aPage.evaluate(() => window.__spokenPhrases);
    expect(spoken.filter(t => t === '黒、ちゅうおしがちです'), `読み上げ: ${JSON.stringify(spoken)}`).toHaveLength(1);
  } finally {
    for (const c of ctxs) await c.close().catch(() => {});
    await teardownSupabaseRoster(classroomId);
  }
});
