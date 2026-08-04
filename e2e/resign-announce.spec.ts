import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { TEST_STUDENT_A, TEST_STUDENT_B, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher, openClassroomAndConnect, waitForStudentJoined, createGame, getOpenStudentButton, waitForObserverPanel } from './helpers/teacher-actions';
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
        Object.defineProperty(window, 'speechSynthesis', {
          value: {
            speak(u: SpeechSynthesisUtterance) { window.__spokenPhrases.push(u.text); },
            cancel() { /* 記録は消さない */ },
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
    const openBtn = getOpenStudentButton(teacherPage, TEST_STUDENT_A.id);
    await expect(openBtn).toBeEnabled({ timeout: 10_000 });
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

    // 声でも結果を伝える
    const spoken = await aPage.evaluate(() => window.__spokenPhrases);
    // 読点で語を区切ってアクセントを頭に来させる（三村さん指定）
    
    expect(spoken, `読み上げ: ${JSON.stringify(spoken)}`).toContain('黒、ちゅうおしがちです');
  } finally {
    for (const c of ctxs) await c.close().catch(() => {});
    await teardownSupabaseRoster(classroomId);
  }
});
