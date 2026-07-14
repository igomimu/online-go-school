import { test } from '@playwright/test';

/**
 * 検証役（私）専用。本番(online.mimura15.jp)に実ブラウザで操作し、
 * 三村さんの2つのログイン経路を撮り分ける。合否は写真が真実。
 *   - 生徒ログイン: 4桁コード
 *   - 生徒ログイン: 生徒ID(UUID)
 *   - 先生画面: 生徒コードが見えるか
 *
 * 実行: set -a; source ~/.secrets/online-go-school-teacher.env; set +a
 *       BASE_URL=https://online.mimura15.jp npx playwright test e2e/proof-prod.spec.ts
 */
const OUT = 'proof-screenshots';
const TEACHER_PW = process.env.TEST_TEACHER_PASSWORD ?? '';

// テスト生徒A（dojo students に student_type=net/status=active で実在）
const STUDENT_UUID = 'd3c90fa1-b1a2-4c3d-8e4f-5a6b7c8d9e0f';
const STUDENT_CODE = '1010';

async function logBuild(page: import('@playwright/test').Page) {
  const t = await page.locator('text=/Build:/').first().innerText().catch(() => 'Build:不明');
  console.log('  ', t.replace(/\n/g, ' '));
}

async function studentLogin(
  page: import('@playwright/test').Page,
  who: string,
  loginValue: string,
  file: string,
) {
  await page.goto('/');
  await logBuild(page);
  await page.getByTestId('student-id-input').fill(loginValue);
  await page.getByTestId('classroom-id-input').fill('verify-' + Date.now());
  await page.getByTestId('student-login-button').click();

  const lobby = page.getByText('先生が対局を作成するのをお待ちください');
  await Promise.race([
    lobby.waitFor({ timeout: 20_000 }).catch(() => {}),
    page.getByText(/確認できません|失敗|一致しません/).waitFor({ timeout: 20_000 }).catch(() => {}),
  ]);
  await page.waitForTimeout(1500);
  const ok = await lobby.isVisible().catch(() => false);
  // ①名前表示: 画面のどこにもUUID(d3c90fa1)/sid:/不明 が残っておらず、かつテスト生徒Aが出ていれば解決
  const body = await page.evaluate(() => document.body.innerText).catch(() => '');
  const hasName = body.includes('テスト生徒A');
  const leaksUuid = body.includes('d3c90fa1') || body.includes('sid:') || body.includes('不明');
  const nameOk = hasName && !leaksUuid;
  await page.screenshot({ path: `${OUT}/${file}`, fullPage: true });
  // ②デバッグ文字が生徒に漏れていないか
  const debugLeak = body.includes('Audio要素') || body.includes('リモート:') || body.includes('0トラック');
  console.log(`[生徒ログイン:${who}] => ${ok ? '✅ ロビー到達（成功）' : '❌ 未到達（失敗）'}  -> ${file}`);
  console.log(`  [名前表示] ${nameOk ? '✅ テスト生徒A（UUID残留なし＝解決）' : `❌ 未解決（name=${hasName} / UUID残留=${leaksUuid}）`}`);
  console.log(`  [デバッグ文字] ${debugLeak ? '❌ 生徒に漏れている' : '✅ 漏れなし'}`);
}

test('生徒ログイン: 4桁コード', async ({ page }) => {
  await studentLogin(page, 'コード', STUDENT_CODE, 'login-by-code.png');
});

test('生徒ログイン: 生徒ID(UUID)', async ({ page }) => {
  await studentLogin(page, 'ID(UUID)', STUDENT_UUID, 'login-by-id.png');
});

test('生徒ログイン: オンライン専用名簿コード', async ({ page }) => {
  await studentLogin(page, '専用名簿', '1000', 'login-online-roster.png');
});

test('先生画面: 生徒コードが見えるか', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('teacher-mode-link').click();
  await page.getByTestId('teacher-password-input').fill(TEACHER_PW);
  await page.getByTestId('teacher-login-button').click();
  await page.waitForTimeout(4000);
  const sync = page.getByText('道場アプリ連携（ネット生）');
  if (await sync.isVisible().catch(() => false)) {
    await sync.click();
    await page.waitForTimeout(5000);
  }
  // 生徒情報タブへ切替（コード一覧を表示）
  const tab = page.getByText('生徒情報', { exact: true });
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
    await page.waitForTimeout(1500);
  }
  await page.screenshot({ path: `${OUT}/teacher-roster.png`, fullPage: true });
  const body = await page.evaluate(() => document.body.innerText).catch(() => '');
  const codeShown = body.includes('ログインコード') && body.includes('1010');
  console.log(`[先生画面:コード表示] ${codeShown ? '✅ ログインコード表示あり(1010検出)' : '❌ コード未表示'}`);
});

test('盤面の見切れ確認(生徒1000)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await page.getByTestId('student-id-input').fill('1000');
  await page.getByTestId('classroom-id-input').fill('CLS20160919347');
  await page.getByTestId('student-login-button').click();
  await page.waitForTimeout(8000);
  const openBtn = page.getByRole('button', { name: '碁盤を開く', exact: true });
  if (await openBtn.isVisible().catch(() => false)) {
    await openBtn.click();
    await page.waitForTimeout(5000);
    console.log('[盤面] 碁盤を開いた');
  } else {
    console.log('[盤面] 碁盤を開くボタンなし(対局未割当?)');
  }
  await page.screenshot({ path: `${OUT}/board-view.png`, fullPage: false });
});

test('再ログイン後に碁盤(別窓)が開くか', async ({ page, context }) => {
  await page.goto('/');
  await page.getByTestId('student-id-input').fill('1000');
  await page.getByTestId('classroom-id-input').fill('CLS20160919347');
  await page.getByTestId('student-login-button').click();
  await page.waitForTimeout(12000); // LiveKit接続待ち
  await page.screenshot({ path: `${OUT}/relogin-lobby.png`, fullPage: false });
  // 「碁盤を開く」ボタンを探す
  const openBtn = page.getByRole('button', { name: /碁盤を開く/ });
  const hasBtn = await openBtn.first().isVisible().catch(() => false);
  console.log('[再ログイン] 碁盤を開くボタン:', hasBtn ? 'あり' : 'なし');
  if (hasBtn) {
    const popupP = context.waitForEvent('page', { timeout: 8000 }).catch(() => null);
    await openBtn.first().click();
    const popup = await popupP;
    if (popup) {
      await popup.waitForTimeout(6000);
      console.log('[再ログイン] 別窓URL:', popup.url());
      console.log('[再ログイン] 別窓本文:', (await popup.evaluate(() => document.body.innerText)).slice(0, 200).replace(/\n/g, ' '));
      await popup.screenshot({ path: `${OUT}/relogin-popup.png`, fullPage: false });
    } else {
      console.log('[再ログイン] 別窓が開かなかった(ポップアップなし)');
    }
  }
});

test('別窓ハングの診断', async ({ page, context }) => {
  await page.goto('/');
  await page.getByTestId('student-id-input').fill('1000');
  await page.getByTestId('classroom-id-input').fill('CLS20160919347');
  await page.getByTestId('student-login-button').click();
  await page.waitForTimeout(12000);
  const openBtn = page.getByRole('button', { name: /碁盤を開く/ });
  if (!(await openBtn.first().isVisible().catch(() => false))) { console.log('DIAG: ボタンなし'); return; }
  const popupP = context.waitForEvent('page', { timeout: 8000 }).catch(() => null);
  await openBtn.first().click();
  const popup = await popupP;
  if (!popup) { console.log('DIAG: 別窓開かず'); return; }
  const errors: string[] = [];
  popup.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`.slice(0, 200)); });
  popup.on('pageerror', e => errors.push(`[pageerror] ${String(e).slice(0,200)}`));
  await popup.waitForTimeout(8000);
  const sessionKeys = await popup.evaluate(() => Object.keys(localStorage).filter(k => k.includes('auth') || k.includes('supabase') || k.includes('sb-')));
  const hasSession = await popup.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('sb-') && (localStorage.getItem(k) || '').includes('access_token')));
  console.log('DIAG: 別窓セッションキー:', JSON.stringify(sessionKeys));
  console.log('DIAG: access_token保持:', hasSession);
  console.log('DIAG: 別窓本文:', (await popup.evaluate(() => document.body.innerText)).slice(0,120).replace(/\n/g,' '));
  console.log('DIAG: エラー:', errors.slice(0,6).join(' || ') || 'なし');
});

test('全画面碁盤がタブ内で開く', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('student-id-input').fill('1000');
  await page.getByTestId('classroom-id-input').fill('CLS20160919347');
  await page.getByTestId('student-login-button').click();
  await page.waitForTimeout(12000);
  const openBtn = page.getByRole('button', { name: /碁盤を開く/ });
  if (!(await openBtn.first().isVisible().catch(() => false))) { console.log('[全画面碁盤] ボタンなし'); return; }
  await openBtn.first().click();
  await page.waitForTimeout(6000);
  const boardVisible = await page.getByTestId('go-board').isVisible().catch(() => false);
  const stuck = (await page.evaluate(() => document.body.innerText)).includes('対局を読み込み中');
  console.log(`[全画面碁盤] 碁盤表示=${boardVisible} / 読み込み中ハング=${stuck}`);
  await page.screenshot({ path: `${OUT}/fullscreen-board.png`, fullPage: false });
});

test('別窓セッション継承の確認', async ({ page, context }) => {
  await page.goto('/');
  await page.getByTestId('student-id-input').fill('1000');
  await page.getByTestId('classroom-id-input').fill('CLS20160919347');
  await page.getByTestId('student-login-button').click();
  await page.waitForTimeout(12000);
  const pageB = await context.newPage();
  await pageB.goto('/?mode=game&gameId=a647b168-b82f-4d59-be1d-3373b2e1a61a&identity=sid%3A1000&role=STUDENT');
  await pageB.waitForTimeout(10000);
  const hasSession = await pageB.evaluate(() => Object.keys(localStorage).some(k => k.startsWith('sb-')));
  const boardVisible = await pageB.getByTestId('go-board').isVisible().catch(() => false);
  const stuck = (await pageB.evaluate(() => document.body.innerText)).includes('読み込み中');
  console.log(`[別窓セッション] session=${hasSession} / 碁盤=${boardVisible} / ハング=${stuck}`);
  await pageB.screenshot({ path: `${OUT}/popup-session.png` });
});

test('リロードでログイン維持', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('teacher-mode-link').click();
  await page.getByTestId('teacher-password-input').fill(TEACHER_PW);
  await page.getByTestId('teacher-login-button').click();
  await page.waitForTimeout(5000);
  await page.reload();
  await page.waitForTimeout(7000);
  const reLoginScreen = await page.getByTestId('teacher-password-input').isVisible().catch(() => false);
  const body = await page.evaluate(() => document.body.innerText);
  const teacherView = body.includes('先生管理') || body.includes('教室情報') || body.includes('教室がありません');
  console.log(`[リロード維持] 再ログイン要求=${reLoginScreen} / 教師画面維持=${teacherView}`);
  await page.screenshot({ path: `${OUT}/reload-persist.png`, fullPage: false });
});
