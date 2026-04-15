import { expect, type Page } from '@playwright/test';

/**
 * 生徒としてログイン → ロビー（待機 or 既存対局あり）まで到達。
 * 初回: 「先生が対局を作成するのをお待ちください」
 * 再接続（既存対局あり）: 「対局中」見出し
 * どちらか早く出た方で成功とする。
 */
export async function loginAsStudent(
  page: Page,
  opts: { studentId: string; classroomId: string },
): Promise<void> {
  await page.getByTestId('student-id-input').fill(opts.studentId);
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
    page
      .getByText('接続に失敗しました')
      .waitFor({ timeout: 25_000 })
      .then(() => 'error' as const),
  ]);

  if (result === 'error') {
    const body = await page.evaluate(() => document.body.innerText.substring(0, 500));
    throw new Error(`生徒ログイン失敗: ${opts.studentId}\n${body}`);
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
 * 対局が配信されたら「碁盤を開く」をクリックして対局画面を表示
 */
export async function enterAssignedGame(page: Page): Promise<void> {
  // Lobby画面の myGame カードの h3「対局中」をピンポイントで待つ
  // （他にも生徒テーブル等に「対局中」テキストがあるため）
  await page.getByRole('heading', { name: '対局中', exact: true }).waitFor({ timeout: 15_000 });
  await page.getByRole('button', { name: '碁盤を開く', exact: true }).click();
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
