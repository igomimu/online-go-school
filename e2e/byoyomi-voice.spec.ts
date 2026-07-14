import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { TEST_STUDENT_A, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher, openClassroomAndConnect, waitForStudentJoined, waitForSimulBoard } from './helpers/teacher-actions';
import { loginAsStudent, enterAssignedGame, waitForMyTurn, playMove } from './helpers/student-actions';

// 回帰テスト: 秒読み音声の二重読み上げ（2026-07-10修正）。
// 読み上げが setLocalClock の updater 内にあり、React が updater を再実行すると
// 「残り2回残り2回です」「最後の最後の考慮時間です」「…9,10,10」とダブっていた。
// dev サーバーは StrictMode なので updater 再実行が確実に起き、修正なしなら本テストが落ちる。
// speechSynthesis をスタブして発話列を記録し、二重が無いことを検証する。

declare global {
  interface Window {
    __spokenPhrases: string[];
  }
}

test('秒読み音声が二重に読み上げられない（持ち時間0・秒読み10秒×2で切れ負けまで）', async ({ browser }) => {
  test.setTimeout(150_000);
  const classroomId = generateClassroomId('voice');
  const contexts: BrowserContext[] = [];
  const newPage = async (init?: boolean): Promise<Page> => {
    const ctx = await browser.newContext();
    contexts.push(ctx);
    const page = await ctx.newPage();
    if (init) {
      // 生徒A側の speechSynthesis を発話レコーダーに差し替える
      await page.addInitScript(() => {
        window.__spokenPhrases = [];
        Object.defineProperty(window, 'speechSynthesis', {
          value: {
            speak(u: SpeechSynthesisUtterance) {
              window.__spokenPhrases.push(u.text);
            },
            cancel() { /* 記録は消さない */ },
          },
          configurable: true,
        });
      });
    }
    return page;
  };

  const teacherPage = await newPage();
  const studentAPage = await newPage(true);

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

    // 対局作成: 生徒A(黒) vs 先生(白)、持ち時間0・秒読み10秒×2（テストを短くするため）
    await teacherPage.getByTestId('create-game-toolbar-button').click();
    await teacherPage.getByTestId('create-game-button').waitFor({ timeout: 5_000 });
    await teacherPage.getByRole('button', { name: '9路', exact: true }).click();

    const blackSelect = teacherPage.getByTestId('black-player-select');
    await expect(blackSelect.locator('option')).toHaveCount(2, { timeout: 20_000 });
    const options = await blackSelect.locator('option').allTextContents();
    const blackIdx = options.findIndex(o => o.includes(TEST_STUDENT_A.name));
    const whiteIdx = options.findIndex(o => o.includes('先生'));
    await blackSelect.selectOption({ index: blackIdx });
    await teacherPage.getByTestId('white-player-select').selectOption({ index: whiteIdx });

    // number input はダイアログ内で コミ → 持ち時間（分） → 秒読みの回数 の順
    const numberInputs = teacherPage.locator('input[type="number"]');
    await numberInputs.nth(1).fill('0'); // 持ち時間0 → いきなり秒読み
    await teacherPage.getByRole('button', { name: '10秒', exact: true }).click();
    await numberInputs.nth(2).fill('2'); // 秒読み2回

    await teacherPage.getByTestId('create-game-button').click();
    await waitForSimulBoard(teacherPage); // 先生は対局者なので多面打ちビューで盤が自動で開く

    // 黒(A)が1手打つと時計が動き出し、白(先生)の秒読みが進む
    await enterAssignedGame(studentAPage);
    await waitForMyTurn(studentAPage);
    await playMove(studentAPage, 4, 4);

    // 白は着手しないので 10秒×2 で時間切れ負け（B+T）。終局表示まで待つ
    await expect(studentAPage.getByText(/結果|時間切れ/).first()).toBeVisible({ timeout: 45_000 });

    const spoken = await studentAPage.evaluate(() => window.__spokenPhrases);
    expect(spoken.length).toBeGreaterThan(0);

    // 1) 同一フレーズが連続しない（「残り2回残り2回です」「最後の最後の考慮時間です」の再発防止）
    const consecutiveDup = spoken.filter((s, i) => i > 0 && spoken[i - 1] === s);
    expect(consecutiveDup, `連続重複: ${JSON.stringify(spoken)}`).toEqual([]);

    // 2) 時間切れの読み上げは1回だけ
    const timeUp = spoken.filter(s => s.includes('時間切れ'));
    expect(timeUp, `時間切れ読み上げ: ${JSON.stringify(spoken)}`).toHaveLength(1);

    // 3) 「10」と「10、時間切れ負けです」が重ねて読まれない（10,10のダブり防止）
    const tenThenTen = spoken.some((s, i) => s === '10' && spoken[i + 1]?.startsWith('10、'));
    expect(tenThenTen, `10がダブる: ${JSON.stringify(spoken)}`).toBe(false);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await teardownSupabaseRoster(classroomId);
  }
});
