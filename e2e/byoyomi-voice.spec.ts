import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { TEST_STUDENT_A, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { createGame, loginAsTeacher, openClassroomAndConnect, waitForStudentJoined, waitForTeacherGameWindow } from './helpers/teacher-actions';
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

    // 対局作成: 生徒A(黒) vs 先生(白)、持ち時間0・秒読み10秒×2（テストを短くするため）。
    // 先生は対局者なので講師専用の別ウィンドウが自動で開く。
    // 時計tickを止めないようウィンドウは閉じずに開いたままにする。
    const teacherGameWindow = await waitForTeacherGameWindow(teacherPage, () =>
      createGame(teacherPage, {
        blackName: TEST_STUDENT_A.name,
        whiteName: '先生',
        boardSize: 9,
        mainMinutes: 0, // 持ち時間0 → いきなり秒読み
        byoyomiSeconds: 10,
        byoyomiPeriods: 2,
      }),
    );

    // 黒(A)→白(先生)と1手ずつ打つと、以降は黒(A)の時計が動く。
    // 講師は時間切れ負けにしない仕様（回線トラブル対策）なので、切れ負けは生徒側で起こす。
    await enterAssignedGame(studentAPage);
    await waitForMyTurn(studentAPage);
    await playMove(studentAPage, 4, 4);
    await playMove(teacherGameWindow, 6, 6);

    // 黒(A)は以降着手しないので 10秒×2 で時間切れ負け（W+T）。終局表示まで待つ
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

// 回帰テスト: 秒読み回を消費した瞬間の告知（「残りN回です」「最後の考慮時間です」）の二重読み上げ
// （2026-07-17修正）。回消費イベントの発声に重複防止キーが無く、「残り2回です」が
// 連続2回読み上げられていた。秒読み3回設定にして、1回目消費時の告知が1回だけであることを検証する。
test('秒読みの回数消費の告知が二重に読み上げられない（持ち時間0・秒読み10秒×3）', async ({ browser }) => {
  test.setTimeout(150_000);
  const classroomId = generateClassroomId('voice3');
  const contexts: BrowserContext[] = [];
  const newPage = async (init?: boolean): Promise<Page> => {
    const ctx = await browser.newContext();
    contexts.push(ctx);
    const page = await ctx.newPage();
    if (init) {
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

    // 対局作成: 生徒A(黒) vs 先生(白)、持ち時間0・秒読み10秒×3
    // （残りN回です→最後の考慮時間です、の遷移を踏むため3回にする）
    const teacherGameWindow = await waitForTeacherGameWindow(teacherPage, () =>
      createGame(teacherPage, {
        blackName: TEST_STUDENT_A.name,
        whiteName: '先生',
        boardSize: 9,
        mainMinutes: 0,
        byoyomiSeconds: 10,
        byoyomiPeriods: 3,
      }),
    );

    await enterAssignedGame(studentAPage);
    await waitForMyTurn(studentAPage);
    await playMove(studentAPage, 4, 4);
    await playMove(teacherGameWindow, 6, 6);

    // 黒(A)は以降着手しないので、1回目(10秒)で「残り2回です」、2回目(20秒)で「最後の考慮時間です」、
    // 3回目(30秒)で時間切れ負けになる。時間切れ表示まで待つ。
    await expect(studentAPage.getByText(/結果|時間切れ/).first()).toBeVisible({ timeout: 45_000 });

    const spoken = await studentAPage.evaluate(() => window.__spokenPhrases);
    expect(spoken.length).toBeGreaterThan(0);

    // 連続重複が無いこと（「残り2回です残り2回です」の再発防止）
    const consecutiveDup = spoken.filter((s, i) => i > 0 && spoken[i - 1] === s);
    expect(consecutiveDup, `連続重複: ${JSON.stringify(spoken)}`).toEqual([]);

    // 「残り2回です」「最後の考慮時間です」はそれぞれちょうど1回だけ発話される
    expect(spoken.filter(s => s === '残り2回です'), `残り2回です: ${JSON.stringify(spoken)}`).toHaveLength(1);
    expect(spoken.filter(s => s === '最後の考慮時間です'), `最後の考慮時間です: ${JSON.stringify(spoken)}`).toHaveLength(1);
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await teardownSupabaseRoster(classroomId);
  }
});

// 回帰テスト: 講師は時間切れ負けにならない（2026-08-01）。
// 回線トラブル等で先生の時計が切れても対局を続行できる必要があるため、
// 秒読みを使い切っても終局せず、秒読みが繰り返される（表示は「残∞」）。
test('講師は秒読みを使い切っても時間切れ負けにならない（持ち時間0・秒読み10秒×1）', async ({ browser }) => {
  test.setTimeout(150_000);
  const classroomId = generateClassroomId('noloss');
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

    // 対局作成: 生徒A(黒) vs 先生(白)、持ち時間0・秒読み10秒×1
    // （秒読み1回だけ = 使い切れば本来は切れ負けになる設定）
    await waitForTeacherGameWindow(teacherPage, () =>
      createGame(teacherPage, {
        blackName: TEST_STUDENT_A.name,
        whiteName: '先生',
        boardSize: 9,
        mainMinutes: 0,
        byoyomiSeconds: 10,
        byoyomiPeriods: 1,
      }),
    );

    // 黒(A)が1手打つと白(先生)の時計が動き出す。先生は着手しない。
    await enterAssignedGame(studentAPage);
    await waitForMyTurn(studentAPage);
    await playMove(studentAPage, 4, 4);

    // 秒読み10秒×1を大きく超えて待っても終局しない
    await studentAPage.waitForTimeout(25_000);

    await expect(studentAPage.getByText(/時間切れ/)).toHaveCount(0);
    await expect(studentAPage.getByTestId('clock-white')).toContainText('残∞');
    await expect(studentAPage.getByText('相手の番です')).toBeVisible();
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await teardownSupabaseRoster(classroomId);
  }
});
