import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher, openClassroomAndConnect, loadSgfForReview } from './helpers/teacher-actions';

// 回帰テスト: 検討モードの碁盤操作をpokekataに揃えた(2026-07-23)。
// マウスホイールでの手順送り/戻り、Delete/Ctrl+Zでの着手取り消し、
// チャット入力中はショートカットを無効化する安全対策を検証する。

test.describe('検討モードの碁盤操作(pokekata踏襲)', () => {
  let teacherContext: BrowserContext;
  let teacherPage: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('review-controls');
    teacherContext = await browser.newContext();
    teacherPage = await teacherContext.newPage();

    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.reload();
  });

  test.afterEach(async () => {
    await teacherContext?.close();
    if (classroomId) await teardownSupabaseRoster(classroomId);
  });

  test('着手→Delete取り消し→ホイールで手順送り/戻りが機能する', async () => {
    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);
    await loadSgfForReview(teacherPage, '(;FF[4]GM[1]SZ[9])');
    await expect(teacherPage.getByText('検討モード')).toBeVisible({ timeout: 15_000 });

    const board = teacherPage.getByTestId('go-board');
    await expect(teacherPage.getByText('0手目')).toBeVisible({ timeout: 10_000 });

    // 着手(4,4) → 1手目
    await board.locator('[data-cell="4-4"]').click();
    await expect(teacherPage.getByText('1手目')).toBeVisible({ timeout: 5_000 });

    // Deleteキーで取り消し → 0手目に戻る
    await teacherPage.keyboard.press('Delete');
    await expect(teacherPage.getByText('0手目')).toBeVisible({ timeout: 5_000 });

    // 再度着手して Ctrl+Z でも取り消せることを確認
    await board.locator('[data-cell="4-4"]').click();
    await expect(teacherPage.getByText('1手目')).toBeVisible({ timeout: 5_000 });
    await teacherPage.keyboard.press('Control+z');
    await expect(teacherPage.getByText('0手目')).toBeVisible({ timeout: 5_000 });

    // 再度着手してから、ホイールで戻る/進む
    await board.locator('[data-cell="4-4"]').click();
    await expect(teacherPage.getByText('1手目')).toBeVisible({ timeout: 5_000 });

    await board.hover();
    await teacherPage.mouse.wheel(0, -100); // 上スクロール = 戻る
    await expect(teacherPage.getByText('0手目')).toBeVisible({ timeout: 5_000 });

    await board.hover();
    await teacherPage.mouse.wheel(0, 100); // 下スクロール = 進む
    await expect(teacherPage.getByText('1手目')).toBeVisible({ timeout: 5_000 });
  });

  test('矢印キーで手順送り/戻り、チャット入力中は無効化される', async () => {
    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);
    await loadSgfForReview(teacherPage, '(;FF[4]GM[1]SZ[9];B[ee])');
    await expect(teacherPage.getByText('検討モード')).toBeVisible({ timeout: 15_000 });
    // SGF読込直後はcurrentNode=root(0手目)。1手目に進むにはArrowRightが必要。
    await expect(teacherPage.getByText('0手目')).toBeVisible({ timeout: 10_000 });

    // ArrowRightで進む
    await teacherPage.keyboard.press('ArrowRight');
    await expect(teacherPage.getByText('1手目')).toBeVisible({ timeout: 5_000 });

    // ArrowLeftで戻る
    await teacherPage.keyboard.press('ArrowLeft');
    await expect(teacherPage.getByText('0手目')).toBeVisible({ timeout: 5_000 });

    // 再度進めてチャット入力中の無効化テストに備える
    await teacherPage.keyboard.press('ArrowRight');
    await expect(teacherPage.getByText('1手目')).toBeVisible({ timeout: 5_000 });

    // チャット入力欄にフォーカスした状態でArrowLeftを押しても手順が動かないこと
    // (8a387f6以降「碁盤のみ最大化」がデフォルトなので操作パネルを開く必要がある)
    const showPanelButton = teacherPage.getByRole('button', { name: '操作パネルを表示' });
    if (await showPanelButton.count() > 0) {
      await showPanelButton.click();
    }
    const chatInput = teacherPage.locator('input[type="text"]').first();
    if (await chatInput.count() > 0) {
      await chatInput.click();
      await teacherPage.keyboard.press('ArrowLeft');
      await expect(teacherPage.getByText('1手目')).toBeVisible({ timeout: 3_000 });
    }
  });
});

// 回帰テスト: 390×667（iPhone の URL バー表示中に相当）で、検討画面の操作列が
// 画面の外へ出ないこと。以前はヘッダーが2行に膨らみ、その分だけ最下段の
// 自動再生の列が 664–702px と画面（667px）からはみ出していた（2026-08-04）。
test.describe('検討モードの狭い画面', () => {
  let ctx: BrowserContext;
  let page: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('review-narrow');
    ctx = await browser.newContext({ viewport: { width: 390, height: 667 }, hasTouch: true, isMobile: true });
    page = await ctx.newPage();
    await page.goto('/');
    await clearAllData(page);
    await setupTeacherPassword(page, TEST_TEACHER_PASSWORD);
    await setupClassroomData(page, classroomId);
    await page.reload();
  });

  test.afterEach(async () => {
    await ctx?.close();
    if (classroomId) await teardownSupabaseRoster(classroomId);
  });

  test('390×667 で操作列が画面内に収まり、見出しが語の途中で折れない', async () => {
    await loginAsTeacher(page);
    await openClassroomAndConnect(page);
    await loadSgfForReview(page, '(;FF[4]GM[1]SZ[9])');
    await page.getByTestId('go-board').waitFor({ timeout: 15_000 });
    await page.waitForTimeout(600);

    const m = await page.evaluate(() => {
      const col = document.querySelector('[data-testid="review-board-column"]')!;
      const last = col.children[col.children.length - 1].getBoundingClientRect();
      const heading = Array.from(document.querySelectorAll('span'))
        .find((s) => s.textContent?.trim() === '検討モード')!;
      const hr = heading.getBoundingClientRect();
      const lineHeight = parseFloat(getComputedStyle(heading).lineHeight || '20');
      return {
        lastBottom: last.bottom,
        viewportH: window.innerHeight,
        headingLines: Math.round(hr.height / lineHeight),
        docWidth: document.documentElement.scrollWidth,
        viewportW: window.innerWidth,
      };
    });

    expect(m.lastBottom).toBeLessThanOrEqual(m.viewportH);
    expect(m.headingLines).toBe(1);           // 「検討モ／ード」と折れない
    expect(m.docWidth).toBeLessThanOrEqual(m.viewportW); // 横にもはみ出さない
  });
});
