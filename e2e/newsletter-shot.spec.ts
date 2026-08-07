import { test, devices, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

/**
 * みむいご通信に載せる紹介画像を撮るためだけのスペック。合否ではなく写真が目的。
 *
 * デモ教室(DEMO01)の仮名の生徒だけを使うので、実在の生徒名は一枚も写らない。
 * 念のため撮影前に「実名が画面に出ていないか」を機械的に検査し、出ていたら落とす。
 *
 * 実行:
 *   set -a; source ~/.secrets/online-go-school-teacher.env; set +a
 *   BASE_URL=https://online.mimura15.jp npx playwright test e2e/newsletter-shot.spec.ts
 */
const OUT = 'newsletter-shots';
const CLASSROOM_ID = 'DEMO01';
const CLASSROOM_NAME = 'デモ教室（見学用）';
const TEACHER_PW = process.env.TEST_TEACHER_PASSWORD ?? '';

const BLACK = { code: 'demo01', name: 'あおい' };
const WHITE = { code: 'demo03', name: 'ゆい' };

// 序盤の一手ずつ。[x, y] は data-cell と同じ 1-indexed。
// あおい(5K) vs ゆい(1K) は棋力差から4子の置碁になり、隅の星は既に埋まっている。
// 白から打ち始めるが、手番はコード側では決めず画面から判定する。
const MOVES: Array<[number, number]> = [
  [17, 6], [14, 3], [6, 17], [3, 14],
  [4, 10], [3, 7], [10, 17], [10, 10],
  [14, 17], [16, 14],
];

test.describe.configure({ mode: 'serial', timeout: 300_000 });

test('みむいご通信用: デモ教室の対局画面を撮る', async ({ browser }) => {
  test.skip(!TEACHER_PW, 'TEST_TEACHER_PASSWORD が未設定');
  fs.mkdirSync(OUT, { recursive: true });

  const teacherCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const blackCtx = await browser.newContext({ ...devices['iPhone 13'] });
  const whiteCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });

  const teacher = await teacherCtx.newPage();
  const black = await blackCtx.newPage();
  const white = await whiteCtx.newPage();

  // === 先生: ログイン → デモ教室を開く ===
  await teacher.goto('/');
  await teacher.getByTestId('teacher-mode-link').click();
  await teacher.getByTestId('teacher-password-input').fill(TEACHER_PW);
  await teacher.getByTestId('teacher-login-button').click();
  await teacher.getByText(CLASSROOM_NAME).waitFor({ timeout: 20_000 });
  await teacher
    .locator('tr', { hasText: CLASSROOM_NAME })
    .locator('button', { hasText: '開く' })
    .first()
    .click();
  await teacher.getByText(/三村囲碁オンライン.*〜/).waitFor({ timeout: 30_000 });

  // === 生徒2人がスマホ／PCから参加 ===
  for (const [page, who] of [[black, BLACK], [white, WHITE]] as const) {
    await page.goto(`/?classroomId=${CLASSROOM_ID}&studentId=${who.code}`);
    const idInput = page.getByTestId('student-id-input');
    if (await idInput.isVisible().catch(() => false)) {
      await idInput.fill(who.code);
      await page.getByTestId('classroom-id-input').fill(CLASSROOM_ID);
      await page.getByTestId('student-login-button').click();
    }
    await Promise.race([
      page.getByText('先生が対局を作成するのをお待ちください').waitFor({ timeout: 40_000 }),
      page.getByTestId('go-board').waitFor({ state: 'visible', timeout: 40_000 }),
    ]);
  }

  // 先生側に2人とも接続済みで出るまで待つ
  for (const who of [BLACK, WHITE]) {
    await teacher
      .locator('tr[data-connected="true"]')
      .filter({ hasText: who.name })
      .first()
      .waitFor({ timeout: 40_000 });
  }

  // === 先生: あおい(黒) vs ゆい(白) の19路を作る ===
  await teacher.getByTestId('create-game-toolbar-button').click();
  await teacher.getByTestId('create-game-button').waitFor({ timeout: 10_000 });
  await teacher.getByRole('button', { name: '19路', exact: true }).click();

  const blackSelect = teacher.getByTestId('black-player-select');
  await expect
    .poll(async () => (await blackSelect.locator('option').allTextContents()).join('|'), { timeout: 30_000 })
    .toContain(BLACK.name);
  const options = await blackSelect.locator('option').allTextContents();
  await blackSelect.selectOption({ index: options.findIndex(o => o.includes(BLACK.name)) });
  await teacher.getByTestId('white-player-select').selectOption({
    index: options.findIndex(o => o.includes(WHITE.name)),
  });
  // 持ち時間30分。既定(0分・秒読み30秒)だと撮影中に時間切れになる。
  await teacher.locator('input[type="number"]').nth(1).fill('30');
  await teacher.getByTestId('create-game-button').click();

  // === 両者の碁盤が出るまで待つ ===
  for (const page of [black, white]) {
    const openButton = page.getByRole('button', { name: '碁盤を開く', exact: true });
    if (await openButton.isVisible().catch(() => false)) await openButton.click();
    await expect(page.getByTestId('go-board')).toBeVisible({ timeout: 30_000 });
  }

  // === 序盤を並べる ===
  // 着手できるのは手番の側だけ（GoBoard は readOnly のとき data-cell を描かない）。
  // どちらが打てるかは画面に聞く。
  for (const [x, y] of MOVES) {
    const mover = await whoseTurn(black, white);
    await mover.getByTestId('go-board').locator(`[data-cell="${x}-${y}"]`).click();
    await mover.waitForTimeout(800);
  }
  await teacher.waitForTimeout(2_000);

  // === 実名が写っていないことを確認してから撮る ===
  const realNames = await fetchRealStudentNames();
  for (const [page, label] of [[black, '生徒(スマホ)'], [white, '生徒(PC)'], [teacher, '先生']] as const) {
    const body = await page.evaluate(() => document.body.innerText);
    const leaked = realNames.filter(n => n.length >= 2 && body.includes(n));
    expect(leaked, `${label}の画面に実在の生徒名が出ている: ${leaked.join(', ')}`).toEqual([]);
  }

  await black.screenshot({ path: `${OUT}/student-mobile.png` });
  await white.screenshot({ path: `${OUT}/student-desktop.png` });
  await teacher.screenshot({ path: `${OUT}/teacher-dashboard.png` });

  console.log(`撮影完了 -> ${OUT}/`);
  await teacherCtx.close();
  await blackCtx.close();
  await whiteCtx.close();
});

/** 着手できる側（＝手番）のページを返す。data-cell が生えているかで判定する。 */
async function whoseTurn(black: Page, white: Page, timeout = 30_000): Promise<Page> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const page of [black, white]) {
      const count = await page.getByTestId('go-board').locator('[data-cell]').count().catch(() => 0);
      if (count > 0) return page;
    }
    await black.waitForTimeout(500);
  }
  throw new Error('どちらの生徒も着手できる状態にならない');
}

/** 実在の生徒名を取ってきて、写り込み検査の突き合わせに使う */
async function fetchRealStudentNames(): Promise<string[]> {
  const url = process.env.VITE_DOJO_SUPABASE_URL ?? readEnv('VITE_DOJO_SUPABASE_URL');
  const key = process.env.VITE_DOJO_SUPABASE_KEY ?? readEnv('VITE_DOJO_SUPABASE_KEY');
  if (!url || !key) return [];
  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(url, key);
  const { data } = await supabase
    .from('go_school_students')
    .select('name, classroom_id')
    .neq('classroom_id', CLASSROOM_ID);
  return (data ?? []).map(r => (r.name ?? '').trim()).filter(Boolean);
}

function readEnv(name: string): string {
  for (const file of ['.env.local', '.env']) {
    if (!fs.existsSync(file)) continue;
    const line = fs.readFileSync(file, 'utf8').split('\n').find(l => l.startsWith(`${name}=`));
    if (line) return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, '');
  }
  return '';
}
