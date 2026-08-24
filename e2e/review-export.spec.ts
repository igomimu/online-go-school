import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher, openClassroomAndConnect, loadSgfForReview } from './helpers/teacher-actions';

// 検討盤の手番号表示（123→全→分）と書き出し（画像・SGF）。操作は Pocket KataGo に合わせてある。
test.describe('検討盤の手番号と書き出し', () => {
  let ctx: BrowserContext;
  let page: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('review-export');
    ctx = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
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

  test('123→全→分 で数字の出方が変わり、変化手順では検討の手だけに番号が出る', async () => {
    await loginAsTeacher(page);
    await openClassroomAndConnect(page);
    // 棋譜の手が1手（黒 ee）。そのあと検討で2手置く
    const review = await loadSgfForReview(page, '(;FF[4]GM[1]SZ[9];B[ee])');
    await expect(review.getByText('検討モード')).toBeVisible({ timeout: 15_000 });
    await review.keyboard.press('ArrowRight');
    await expect(review.getByText('1手目')).toBeVisible({ timeout: 10_000 });

    const board = review.getByTestId('go-board');
    await board.locator('[data-cell="3-3"]').click();
    await expect(review.getByText('2手目')).toBeVisible({ timeout: 5_000 });
    await board.locator('[data-cell="7-7"]').click();
    await expect(review.getByText('3手目')).toBeVisible({ timeout: 5_000 });

    const stoneNumbers = () => board.locator('[data-stone] text');

    // 既定は数字なし
    await expect(stoneNumbers()).toHaveCount(0);

    // 並び順は盤の座標順（左上から）なので、比べる前に揃える
    const shownNumbers = async () => (await stoneNumbers().allTextContents()).sort();

    // 「全」= 3つの石すべてに通し手数
    await review.getByTestId('cycle-number-mode').click();
    await expect(stoneNumbers()).toHaveCount(3);
    expect(await shownNumbers()).toEqual(['1', '2', '3']);

    // 「分」= 棋譜の手には出ず、検討で置いた2手だけ 1,2
    await review.getByTestId('cycle-number-mode').click();
    await expect(stoneNumbers()).toHaveCount(2);
    expect(await shownNumbers()).toEqual(['1', '2']);

    // もう一度で消える
    await review.getByTestId('cycle-number-mode').click();
    await expect(stoneNumbers()).toHaveCount(0);

    // M キーでも同じ順に回る（Pocket KataGo と同じ）
    await review.keyboard.press('m');
    await expect(stoneNumbers()).toHaveCount(3);
  });

  test('メニューから画像を保存でき、SGFがクリップボードに入る', async () => {
    await loginAsTeacher(page);
    await openClassroomAndConnect(page);
    const review = await loadSgfForReview(page, '(;FF[4]GM[1]SZ[9];B[ee])');
    await expect(review.getByText('検討モード')).toBeVisible({ timeout: 15_000 });
    await review.keyboard.press('ArrowRight');
    await expect(review.getByText('1手目')).toBeVisible({ timeout: 10_000 });

    // 画像を保存 → PNG がダウンロードされる
    const downloadPromise = review.waitForEvent('download');
    await review.getByTestId('export-menu').click();
    await review.getByTestId('save-image').click();
    await expect(review.getByTestId('export-message')).toHaveText('画像を保存しました');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.png$/);
    expect(await download.path()).toBeTruthy();

    // SGF をコピー → クリップボードに棋譜が入る
    await review.getByTestId('export-menu').click();
    await review.getByTestId('copy-sgf').click();
    await expect(review.getByTestId('export-message')).toHaveText('SGFをコピーしました');
    const sgf = await review.evaluate(() => navigator.clipboard.readText());
    expect(sgf).toContain('SZ[9]');
    expect(sgf).toContain(';B[ee]');

    // 画像をコピー → クリップボードにPNGが入る
    await review.getByTestId('export-menu').click();
    await review.getByTestId('copy-image').click();
    await expect(review.getByTestId('export-message')).toHaveText('画像をコピーしました');
    const clipboardTypes = await review.evaluate(async () => {
      const items = await navigator.clipboard.read();
      return items.flatMap(i => i.types);
    });
    expect(clipboardTypes).toContain('image/png');

    // Ctrl+S でも SGF ファイルが落ちる
    const [sgfDownload] = await Promise.all([
      review.waitForEvent('download'),
      review.keyboard.press('Control+s'),
    ]);
    expect(sgfDownload.suggestedFilename()).toMatch(/\.sgf$/);
  });
});
