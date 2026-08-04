import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import {
  loginAsTeacher,
  openClassroomAndConnect,
  loadSgfForReview,
} from './helpers/teacher-actions';

/**
 * 検討モードの AiAnalysisPanel 候補手クリックで盤面に SQR マーカーが付くことを検証する。
 *
 * 本テストの目的は **候補手行クリック→盤面マーカー追加** という配線そのものの検証なので、
 * `page.route()` でサーバーサイドプロキシ /api/katago-analyze を deterministic にモックする。
 * これにより、KataGo の起動状態に依存せず、毎回同じ結果で wiring を検証できる。
 */

interface MockAnalysisResult {
  winrate: number;
  scoreLead: number;
  topMoves: Array<{
    move: string;
    winrate: number;
    scoreLead: number;
    visits: number;
    pv: string[];
  }>;
}

const MOCK_RESPONSE: MockAnalysisResult = {
  winrate: 50,
  scoreLead: 0,
  topMoves: [
    // 9路盤 (5,5) = 天元 を GTP で表すと E5。SGFには黒石が ee=(5,5) にあるので別の手を返す。
    { move: 'D4', winrate: 55, scoreLead: 1.2, visits: 1000, pv: ['D4'] },
    { move: 'G5', winrate: 52, scoreLead: 0.8, visits: 800, pv: ['G5'] },
  ],
};

async function mockKatagoApi(page: Page): Promise<void> {
  await page.route('**/api/katago-analyze', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_RESPONSE),
    });
  });
}

test.describe('検討モード AI候補手クリック', () => {
  let teacherContext: BrowserContext;
  let teacherPage: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('review-ai');
    teacherContext = await browser.newContext();
    teacherPage = await teacherContext.newPage();

    // /api/katago-analyze をモック (route 設定はページ遷移前にしておく)
    await mockKatagoApi(teacherPage);

    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    // 探索数だけ端末に入れておく。AIのON/OFFは保存されず毎回オフ始まりなので、
    // 検討モードに入ってから ai-toggle でONにする（2026-08-02 仕様変更）。
    await teacherPage.evaluate(() => {
      localStorage.setItem('go-school-ai-settings', JSON.stringify({ maxVisits: 100, version: 2 }));
    });
    await teacherPage.reload();
    // reload で route 設定が消えるのでもう一度貼る
    await mockKatagoApi(teacherPage);
  });

  test.afterEach(async () => {
    await teacherContext?.close();
    if (classroomId) {
      await teardownSupabaseRoster(classroomId);
    }
  });

  test('SGF読込→検討モード→候補手クリックで盤面にSQRマーカー、再クリックで解除', async () => {
    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);

    // SGF を流し込んで検討モードに遷移（9路、黒1手）
    const review = await loadSgfForReview(teacherPage, '(;FF[4]GM[1]SZ[9];B[ee])');

    // PCでは碁盤とAI情報を最初から半分ずつ表示する。
    await expect(review.getByText('検討モード')).toBeVisible({ timeout: 15_000 });
    await expect(review.getByRole('heading', { name: 'AI分析' })).toBeVisible({ timeout: 15_000 });
    // 検討開始時はAIオフなので、講師がONにしてから解析結果を待つ
    await review.getByTestId('ai-toggle').click();

    const boardColumn = review.getByTestId('review-board-column');
    const infoColumn = review.getByTestId('review-info-column');
    const [boardBox, infoBox] = await Promise.all([boardColumn.boundingBox(), infoColumn.boundingBox()]);
    expect(boardBox).not.toBeNull();
    expect(infoBox).not.toBeNull();
    expect(Math.abs((boardBox?.width ?? 0) - (infoBox?.width ?? 0))).toBeLessThan(24);
    expect((infoBox?.x ?? 0) + (infoBox?.width ?? 0)).toBeLessThanOrEqual(review.viewportSize()?.width ?? 1440);

    // モック応答後、候補手リストに 'D4' / 'G5' が出る
    const moveD4 = review.locator('text=D4').first();
    await expect(moveD4).toBeVisible({ timeout: 10_000 });
    await expect(review.getByTestId('ai-candidate-0')).toBeVisible();

    // Pocket KataGoと同じく、候補手へホバーするとPVが番号付きで盤上に出る。
    const candidateRow = review.getByTestId('ai-move-0');
    await candidateRow.hover();
    await expect(review.getByTestId('pv-stone-1')).toBeVisible();

    // クリック前: 盤面上に SQR マーカーは無い
    // GoBoard が SQR を `<rect fill="none" stroke=...>` で描画する (GoBoard.tsx:272)
    // 他の rect は背景=fill="#DCB35C" / click=fill="transparent" / 死石マーク=fill="none" stroke="red"
    // 死石マークは scoring モード限定で、検討モードでは出ない → fill="none" で SQR を一意に特定できる
    // testid="go-board" は SVG 自身に付いているので直接そこから rect を数える
    const boardSvg = review.getByTestId('go-board');
    const rectCountBefore = await boardSvg.locator('rect[fill="none"]').count();

    // 候補手 D4 の行をクリック
    // AiAnalysisPanel.tsx の候補手は div.cursor-pointer に GTP移動文字列を持つ
    await expect(candidateRow).toBeVisible();
    await candidateRow.click();

    // 盤面に SQR の rect が1つ増えている
    await expect.poll(
      async () => boardSvg.locator('rect[fill="none"]').count(),
      { timeout: 5_000 },
    ).toBe(rectCountBefore + 1);

    // 同じ行をもう一度クリックでトグル解除 (aiHighlight=null) → rect が元の数に戻る
    await candidateRow.click();
    await expect.poll(
      async () => boardSvg.locator('rect[fill="none"]').count(),
      { timeout: 5_000 },
    ).toBe(rectCountBefore);
  });
});
