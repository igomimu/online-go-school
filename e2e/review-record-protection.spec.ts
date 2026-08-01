import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher, openClassroomAndConnect, loadSgfForReview } from './helpers/teacher-actions';

// 回帰テスト: 検討モードで棋譜にない手を並べても、読み込んだ棋譜（元手順）が失われないこと。
// 2026-08-01: 取り消し(Delete/Ctrl+Z/↺)を置いた手数より多く押すと、棋譜本体の手が
// 1手ずつツリーから削除され、最後は空の盤になっていた（実機再現）。
const SGF_5MOVES = '(;FF[4]GM[1]SZ[9];B[ee];W[cc];B[gg];W[cg];B[gc])';

// 棋譜の手: 1=5-5(黒) 2=3-3(白) 3=7-7(黒) 4=3-7(白) 5=7-3(黒)
const RECORD_STONES = ['3-3', '3-7', '5-5', '7-3', '7-7'];

test.describe('検討モード: 元手順の保護', () => {
  let ctx: BrowserContext;
  let page: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('record-protect');
    ctx = await browser.newContext();
    page = await ctx.newPage();
    await page.goto('/');
    await clearAllData(page);
    await setupTeacherPassword(page, TEST_TEACHER_PASSWORD);
    await setupClassroomData(page, classroomId);
    await page.reload();
    await loginAsTeacher(page);
    await openClassroomAndConnect(page);
  });

  test.afterEach(async () => {
    await ctx?.close();
    if (classroomId) await teardownSupabaseRoster(classroomId);
  });

  /** 盤上の石の座標一覧（data-cellの中心にある石を拾う） */
  const stones = (p: Page) => p.evaluate(() => {
    const svg = document.querySelector('[data-testid="go-board"]')!;
    const cells = Array.from(svg.querySelectorAll('rect[data-cell]')) as SVGRectElement[];
    const out: string[] = [];
    for (const c of cells) {
      const cx = Number(c.getAttribute('x')) + Number(c.getAttribute('width')) / 2;
      const cy = Number(c.getAttribute('y')) + Number(c.getAttribute('height')) / 2;
      const hit = Array.from(svg.querySelectorAll('circle')).find(ci =>
        Math.abs(Number(ci.getAttribute('cx')) - cx) < 3 &&
        Math.abs(Number(ci.getAttribute('cy')) - cy) < 3 &&
        Number(ci.getAttribute('r')) > 8);
      if (hit) out.push(String(c.getAttribute('data-cell')));
    }
    return out.sort();
  });

  test('棋譜にない手を置いても、戻って再生すると元手順が出る', async () => {
    await loadSgfForReview(page, SGF_5MOVES);
    await expect(page.getByText('検討モード')).toBeVisible({ timeout: 15_000 });

    // 3手目まで進めて、棋譜にない手を置く
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByText('3手目')).toBeVisible();
    await page.getByTestId('go-board').locator('[data-cell="1-1"]').click({ timeout: 15_000 });
    await expect(page.getByText('4手目')).toBeVisible();
    expect(await stones(page)).toContain('1-1');

    // 戻って進むと、置いた手ではなく棋譜の4手目(3-7)が出る
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    const after = await stones(page);
    expect(after).toContain('3-7');
    expect(after).not.toContain('1-1');

    // 最後まで再生すると棋譜の5手が揃う
    await page.keyboard.press('ArrowRight');
    expect(await stones(page)).toEqual(RECORD_STONES);
  });

  test('取り消しを押しすぎても棋譜の手は消えない', async () => {
    await loadSgfForReview(page, SGF_5MOVES);
    await expect(page.getByText('検討モード')).toBeVisible({ timeout: 15_000 });

    // 3手目まで進めて検討の手を2つ置く
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
    await page.getByTestId('go-board').locator('[data-cell="1-1"]').click({ timeout: 15_000 });
    await page.getByTestId('go-board').locator('[data-cell="2-1"]').click({ timeout: 15_000 });
    await expect(page.getByText('5手目')).toBeVisible();

    // 置いたのは2手だが取り消しを5回押す（余分な3回で棋譜を食べていた）
    for (let i = 0; i < 5; i++) await page.keyboard.press('Delete');

    // 棋譜は無傷: 最初から再生して5手すべて並ぶ
    await page.keyboard.press('Home');
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByText('5手目')).toBeVisible();
    expect(await stones(page)).toEqual(RECORD_STONES);
  });
});
