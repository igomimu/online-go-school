import { test } from '@playwright/test';

/**
 * 検証役専用（git非管理）。2026-07-08 の4機能を本番で撮影・確認する。
 * 実行: set -a; source ~/.secrets/online-go-school-teacher.env; set +a
 *       BASE_URL=https://online.mimura15.jp npx playwright test e2e/proof-features-20260708.spec.ts --project=chromium
 */
const OUT = 'proof-screenshots';
const TEACHER_PW = process.env.TEST_TEACHER_PASSWORD ?? '';

test('PWA: SW登録・manifest・ログイン画面', async ({ page }) => {
  await page.goto('/');
  await page.waitForTimeout(5000); // SW登録待ち
  const swCount = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return -1;
    const regs = await navigator.serviceWorker.getRegistrations();
    return regs.length;
  });
  const manifestHref = await page.evaluate(
    () => document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? '',
  );
  const body = await page.evaluate(() => document.body.innerText);
  const hasInstallBtn = body.includes('アプリをインストール') || body.includes('ホーム画面に追加');
  await page.screenshot({ path: `${OUT}/f1-login-pwa.png`, fullPage: true });
  console.log(`[PWA] SW登録数=${swCount} ${swCount > 0 ? '✅' : '❌'} / manifest=${manifestHref || '❌なし'}`);
  console.log(`[PWA] 生徒ログイン画面ボタン=${hasInstallBtn ? '✅あり' : '❌なし（常時表示化後は出るはず）'}`);

  // 先生ログイン画面でも常時表示されるか
  await page.getByTestId('teacher-mode-link').click();
  await page.waitForTimeout(500);
  const teacherBody = await page.evaluate(() => document.body.innerText);
  const teacherHasBtn = teacherBody.includes('アプリをインストール') || teacherBody.includes('ホーム画面に追加');
  await page.screenshot({ path: `${OUT}/f1b-teacher-login-pwa.png`, fullPage: true });
  console.log(`[PWA] 先生ログイン画面ボタン=${teacherHasBtn ? '✅あり' : '❌なし'}`);
});

test('教室管理画面にインストールボタン（先生ログイン直後の画面）', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('teacher-mode-link').click();
  await page.getByTestId('teacher-password-input').fill(TEACHER_PW);
  await page.getByTestId('teacher-login-button').click();
  await page.waitForTimeout(4000);
  const body = await page.evaluate(() => document.body.innerText);
  const hasBtn = body.includes('アプリをインストール');
  await page.screenshot({ path: `${OUT}/f1c-manage-install.png`, fullPage: true });
  // 下部バーがビューポート内に収まっているか（見切れ検知）
  const btn = page.getByText('アプリをインストール', { exact: false }).first();
  const inViewport = await btn.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.bottom <= window.innerHeight && r.top >= 0;
  }).catch(() => false);
  console.log(`[教室管理] インストールボタン=${hasBtn ? '✅あり' : '❌なし'} / ビューポート内=${inViewport ? '✅' : '❌見切れ'}`);
});

test('対局作成ダイアログに対局時計欄（機能2の実在証跡）', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('teacher-mode-link').click();
  await page.getByTestId('teacher-password-input').fill(TEACHER_PW);
  await page.getByTestId('teacher-login-button').click();
  await page.waitForTimeout(4000);
  // 教室管理画面 → 最初の教室を「開く」でダッシュボードへ
  await page.locator('tr').filter({ has: page.locator('button', { hasText: '開く' }) })
    .first().locator('button', { hasText: '開く' }).click();
  await page.getByText(/三村囲碁オンライン.*〜/).waitFor({ timeout: 20_000 });
  await page.getByTestId('create-game-toolbar-button').click();
  await page.waitForTimeout(1000);
  const body = await page.evaluate(() => document.body.innerText);
  const hasClock = body.includes('対局時計');
  const hasPreset = body.includes('持10分');
  await page.screenshot({ path: `${OUT}/f2-game-creation-clock.png`, fullPage: true });
  console.log(`[対局作成] 対局時計欄=${hasClock ? '✅表示' : '❌なし'} プリセット=${hasPreset ? '✅' : '❌'}`);
});

test('自動ペアリングに対局時計欄（機能2残ギャップの解消証跡）', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('teacher-mode-link').click();
  await page.getByTestId('teacher-password-input').fill(TEACHER_PW);
  await page.getByTestId('teacher-login-button').click();
  await page.waitForTimeout(4000);
  await page.locator('tr').filter({ has: page.locator('button', { hasText: '開く' }) })
    .first().locator('button', { hasText: '開く' }).click();
  await page.getByText(/三村囲碁オンライン.*〜/).waitFor({ timeout: 20_000 });
  // ツールバーの「自動対局」ボタン（AutoPairingDialogを開く）
  const pairBtn = page.getByText('自動対局', { exact: true }).first();
  const found = await pairBtn.isVisible().catch(() => false);
  if (found) {
    await pairBtn.click();
    await page.waitForTimeout(1000);
  }
  const body = await page.evaluate(() => document.body.innerText);
  const hasClock = body.includes('対局時計');
  await page.screenshot({ path: `${OUT}/f3-auto-pairing-clock.png`, fullPage: true });
  console.log(`[自動ペアリング] ダイアログ=${found ? '✅開いた' : '❌ボタン不明'} 対局時計欄=${hasClock ? '✅表示' : '❌なし'}`);
});
