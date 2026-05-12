import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData } from './helpers/setup';
import {
  loginAsTeacher,
  openClassroomAndConnect,
  loadSgfForReview,
} from './helpers/teacher-actions';

/**
 * 検討モードの AiAnalysisPanel 候補手クリックで盤面に SQR マーカーが付くことを検証する。
 *
 * 実 KataGo サーバ (VITE_KATAGO_SERVER_URL) は JWT 認証が必要で、E2E 環境では到達不能
 * もしくは 401 を返す。本テストの目的は **候補手行クリック→盤面マーカー追加** という
 * 配線そのものの検証なので、`page.route()` で /api/analyze を deterministic にモックする。
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
  await page.route('**/api/analyze', async (route) => {
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

    // /api/analyze をモック (route 設定はページ遷移前にしておく)
    await mockKatagoApi(teacherPage);

    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    // AI設定を「ON + 任意のサーバURL」で書き込んでおく
    await teacherPage.evaluate(() => {
      localStorage.setItem('go-school-ai-settings', JSON.stringify({
        serverUrl: 'http://mock-katago.invalid',
        maxVisits: 100,
        enabled: true,
      }));
    });
    await teacherPage.reload();
    // reload で route 設定が消えるのでもう一度貼る
    await mockKatagoApi(teacherPage);
  });

  test.afterEach(async () => {
    await teacherContext?.close();
  });

  test('SGF読込→検討モード→候補手クリックで盤面にSQRマーカー、再クリックで解除', async () => {
    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);

    // SGF を流し込んで検討モードに遷移（9路、黒1手）
    await loadSgfForReview(teacherPage, '(;FF[4]GM[1]SZ[9];B[ee])');

    // 検討モードのヘッダ／盤面が出るまで待つ
    // AiAnalysisPanel に「AI分析」ヘッダがあるのでこれを目印にする
    await expect(teacherPage.getByRole('heading', { name: 'AI分析' })).toBeVisible({ timeout: 15_000 });

    // モック応答後、候補手リストに 'D4' / 'G5' が出る
    const moveD4 = teacherPage.locator('text=D4').first();
    await expect(moveD4).toBeVisible({ timeout: 10_000 });

    // クリック前: 盤面上に SQR マーカーは無い
    // GoBoard が SQR を `<rect fill="none" stroke=...>` で描画する (GoBoard.tsx:272)
    // 他の rect は背景=fill="#DCB35C" / click=fill="transparent" / 死石マーク=fill="none" stroke="red"
    // 死石マークは scoring モード限定で、検討モードでは出ない → fill="none" で SQR を一意に特定できる
    // testid="go-board" は SVG 自身に付いているので直接そこから rect を数える
    const boardSvg = teacherPage.getByTestId('go-board');
    const rectCountBefore = await boardSvg.locator('rect[fill="none"]').count();

    // 候補手 D4 の行をクリック
    // AiAnalysisPanel.tsx の候補手は div.cursor-pointer に GTP移動文字列を持つ
    const candidateRow = teacherPage.locator('div.cursor-pointer').filter({ hasText: 'D4' }).first();
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
