import { expect, type Page } from '@playwright/test';

/**
 * 生徒としてログイン → ロビー（待機 or 既存対局あり）まで到達。
 * 初回: 「先生が対局を作成するのをお待ちください」
 * 再接続（既存対局あり）: 「対局中」見出し
 * どちらか早く出た方で成功とする。
 */
export async function loginAsStudent(
  page: Page,
  opts: { studentCode: string; classroomId: string },
): Promise<void> {
  await page.getByTestId('student-id-input').fill(opts.studentCode);
  await page.getByTestId('classroom-id-input').fill(opts.classroomId);
  await page.getByTestId('student-login-button').click();

  const result = await Promise.race([
    page
      .getByText('先生が対局を作成するのをお待ちください')
      .waitFor({ timeout: 25_000 })
      .then(() => 'lobby' as const),
    page
      .getByRole('heading', { name: '対局中', exact: true })
      .waitFor({ timeout: 25_000 })
      .then(() => 'in-game' as const),
    // 進行中対局があると自動で碁盤に直行する（2026-07-08 自動オープン機能）
    page
      .getByTestId('go-board')
      .waitFor({ state: 'visible', timeout: 25_000 })
      .then(() => 'auto-opened-board' as const),
    page
      .getByText('接続に失敗しました')
      .waitFor({ timeout: 25_000 })
      .then(() => 'error' as const),
  ]);

  if (result === 'error') {
    const body = await page.evaluate(() => document.body.innerText.substring(0, 500));
    throw new Error(`生徒ログイン失敗: ${opts.studentCode}\n${body}`);
  }
}

/**
 * 「N人接続中」の数字が期待値以上になるまで待つ
 */
export async function waitForConnectedCount(page: Page, min: number, timeout = 20_000): Promise<void> {
  // N人接続中 表示（N=1以上の数字）
  const pattern = new RegExp(`[${min}-9]\\d*人接続中`);
  await expect(page.getByText(pattern)).toBeVisible({ timeout });
}

/**
 * 対局が配信されたら対局画面を表示する。
 * 現行UIは自動で碁盤へ遷移するが、旧挙動の手動ボタンにも対応する。
 */
export async function enterAssignedGame(page: Page): Promise<void> {
  const board = page.getByTestId('go-board');
  const openButton = page.getByRole('button', { name: '碁盤を開く', exact: true });

  const entry = await Promise.race([
    board.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'board' as const),
    openButton.waitFor({ state: 'visible', timeout: 15_000 }).then(() => 'button' as const),
  ]);

  if (entry === 'button') {
    await openButton.click();
  }
  await expect(board).toBeVisible({ timeout: 15_000 });
}

/**
 * 指定座標に着手（0-indexed、data-cell="col-row"）
 */
export async function playMove(page: Page, col: number, row: number): Promise<void> {
  await page.getByTestId('go-board').locator(`[data-cell="${col}-${row}"]`).click();
}

/**
 * 自分の手番になるまで待つ
 */
export async function waitForMyTurn(page: Page, timeout = 10_000): Promise<void> {
  await page.getByText('あなたの番です').waitFor({ timeout });
}
