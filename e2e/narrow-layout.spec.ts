import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { TEST_STUDENT_A, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher, openClassroomAndConnect, waitForStudentJoined, createGame } from './helpers/teacher-actions';
import { loginAsStudent, enterAssignedGame } from './helpers/student-actions';

/**
 * 狭い幅でレイアウトが壊れないことを確かめる。
 *
 * 2026-08-12 のデザインレビューで見つかった崩れ:
 *   - 生徒スマホのヘッダーで「生徒」「氏名」「1人接続中」が1文字ずつ縦積みになり、
 *     カメラのボタンが画面外に切れて押せなかった
 *   - 対局ウィンドウで対局者名・持ち時間・手数が縦に潰れて読めなかった
 * どちらも flex 1行に要素を詰め込み、各要素が最小幅まで圧縮されたのが原因。
 *
 * 判定は「日本語が縦積みになっていないか」を要素の高さで見る。1文字ずつ縦に
 * 積まれると、その要素の高さは文字数ぶんに膨らむ。あわせて横スクロールが
 * 生まれていないこと（画面外に逃げた操作が無いこと）も見る。
 */

const MOBILE = { width: 360, height: 780 };   // 想定する最小のスマホ
const GAME_WINDOW = { width: 560, height: 800 }; // 対局用の別ウィンドウ

/** 要素が1〜2行に収まっているか。縦積みなら文字数ぶんの高さになる */
async function expectNotStacked(page: Page, selector: string, label: string) {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `${label} が見つからない`).not.toBeNull();
  const fontSize = await page.locator(selector).first().evaluate(
    el => parseFloat(getComputedStyle(el).fontSize),
  );
  // 2行ぶん + 行間の余裕。1文字ずつ縦積みになるとこれを大きく超える
  expect(box!.height, `${label} が縦に潰れている（高さ${box!.height}px / 文字${fontSize}px）`)
    .toBeLessThan(fontSize * 3.2);
}

/** ページ全体に横スクロールが出ていないこと＝画面外に逃げた操作が無いこと */
async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
  expect(overflow.scrollWidth, '横スクロールが発生している').toBeLessThanOrEqual(overflow.clientWidth + 1);
}

test.describe('狭い幅でのレイアウト', () => {
  let teacherContext: BrowserContext;
  let studentContext: BrowserContext;
  let teacherPage: Page;
  let studentPage: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('narrow');
    teacherContext = await browser.newContext();
    studentContext = await browser.newContext({ viewport: MOBILE });
    teacherPage = await teacherContext.newPage();
    studentPage = await studentContext.newPage();

    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.reload();

    await studentPage.goto('/');
    await clearAllData(studentPage);
    await studentPage.reload();
  });

  test.afterEach(async () => {
    await teacherContext?.close();
    await studentContext?.close();
    await teardownSupabaseRoster(classroomId);
  });

  test('生徒スマホ360px: ヘッダーが縦積みにならず、操作が画面内に収まる', async () => {
    await loginAsStudent(studentPage, { studentCode: TEST_STUDENT_A.code, classroomId });

    // 「生徒」バッジ・氏名・接続人数が1文字ずつ縦に積まれていないこと
    await expectNotStacked(studentPage, 'header h2', '「生徒」の見出し');
    await expectNotStacked(studentPage, 'header h2 + span', '生徒の氏名');

    // マイク・スピーカー・カメラの3つが、すべて画面内にあって押せること
    const viewportWidth = MOBILE.width;
    for (const label of ['マイク', 'スピーカー', 'カメラ']) {
      const button = studentPage.locator('header button', { hasText: label }).first();
      await expect(button, `${label}のボタンが無い`).toBeVisible();
      const box = await button.boundingBox();
      expect(box!.x, `${label}のボタンが画面の左外`).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, `${label}のボタンが画面の右外に切れている`)
        .toBeLessThanOrEqual(viewportWidth + 1);
      // タップできる高さ（44px以上）
      expect(box!.height, `${label}のボタンが小さすぎる`).toBeGreaterThanOrEqual(44);
    }

    await expectNoHorizontalOverflow(studentPage);
    await studentPage.screenshot({ path: 'test-results/narrow-student-lobby.png', fullPage: false });
  });

  test('対局画面560px: 対局者名・持ち時間・手数が潰れない', async () => {
    await loginAsStudent(studentPage, { studentCode: TEST_STUDENT_A.code, classroomId });
    await loginAsTeacher(teacherPage, TEST_TEACHER_PASSWORD);
    await openClassroomAndConnect(teacherPage);
    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);
    await createGame(teacherPage, {
      blackName: TEST_STUDENT_A.name,
      whiteName: '三村九段',
      boardSize: 9,
    });

    // 生徒側を対局ウィンドウの幅にして、対局画面を開く
    await studentPage.setViewportSize(GAME_WINDOW);
    await enterAssignedGame(studentPage);
    await expect(studentPage.getByTestId('go-board')).toBeVisible({ timeout: 15_000 });

    // 対局者名・アゲハマ・持ち時間・手数。どれも縦積みにならないこと
    await expectNotStacked(studentPage, '[data-testid="clock-black"]', '黒の持ち時間');
    await expectNotStacked(studentPage, '[data-testid="clock-white"]', '白の持ち時間');
    await expectNotStacked(studentPage, '[data-testid="move-count"]', '手数');
    await expectNotStacked(studentPage, '[data-testid="komi-label"]', 'コミ');

    // 名前は truncate で1行に収まる。
    // 生徒側は名簿を持たないので、表示名は「対局者」になることがある（名前そのものは問わない）。
    const blackName = studentPage.getByText(/^黒：/);
    await expect(blackName).toBeVisible();
    const nameBox = await blackName.boundingBox();
    const nameFont = await blackName.evaluate(el => parseFloat(getComputedStyle(el).fontSize));
    expect(nameBox!.height, '対局者名が縦に潰れている').toBeLessThan(nameFont * 2.2);

    await expectNoHorizontalOverflow(studentPage);
    await studentPage.screenshot({ path: 'test-results/narrow-game-board.png', fullPage: false });
  });
});
