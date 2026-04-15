import { expect, type Page } from '@playwright/test';
import { TEST_CLASSROOM_NAME, TEST_TEACHER_PASSWORD } from './test-data';

/**
 * 先生としてログイン → ClassroomManager画面まで到達
 */
export async function loginAsTeacher(page: Page, password: string = TEST_TEACHER_PASSWORD): Promise<void> {
  await page.getByTestId('teacher-mode-link').click();
  await page.getByTestId('teacher-password-input').fill(password);
  await page.getByTestId('teacher-login-button').click();
  await page.getByText(TEST_CLASSROOM_NAME).waitFor({ timeout: 5_000 });
}

/**
 * 教室を開き、ダッシュボード（LiveKit接続完了）まで到達
 */
export async function openClassroomAndConnect(page: Page): Promise<void> {
  await page.locator('button', { hasText: '開く' }).first().click();
  // TeacherDashboardヘッダ到達
  await page.getByText('三村囲碁オンライン', { exact: true }).waitFor({ timeout: 20_000 });
}

/**
 * 指定した生徒が **LiveKit接続済み状態** で生徒テーブルに現れるまで待つ。
 * StudentTableは未接続の登録生徒もグレー表示するので、data-connected="true"の行を待つ必要がある。
 */
export async function waitForStudentJoined(page: Page, studentId: string, timeout = 20_000): Promise<void> {
  await page
    .locator(`tr[data-connected="true"][data-student-id="${studentId}"]`)
    .first()
    .waitFor({ timeout });
}

/**
 * 対局作成ダイアログを開いて条件を入れ、対局開始をクリック
 * expectedPlayersCount: 先生+参加生徒数（先生1+生徒2なら3）
 */
export async function createGame(
  page: Page,
  opts: {
    blackName: string;
    whiteName: string;
    boardSize?: 9 | 13 | 19;
    expectedPlayersCount?: number;
  },
): Promise<void> {
  const { blackName, whiteName, boardSize = 9, expectedPlayersCount = 2 } = opts;

  await page.getByTestId('create-game-toolbar-button').click();
  await page.getByTestId('create-game-button').waitFor({ timeout: 5_000 });

  // 碁盤サイズ選択
  await page.getByRole('button', { name: `${boardSize}路`, exact: true }).click();

  // プレイヤー選択肢が揃うまで待つ（ダイアログ生成タイミングのバグ検出）
  const blackSelect = page.getByTestId('black-player-select');
  await expect(blackSelect.locator('option')).toHaveCount(expectedPlayersCount, { timeout: 20_000 });

  const options = await blackSelect.locator('option').allTextContents();
  const blackIdx = options.findIndex((o) => o.includes(blackName));
  const whiteIdx = options.findIndex((o) => o.includes(whiteName));
  if (blackIdx < 0) throw new Error(`黒番候補に "${blackName}" が見つからない: ${JSON.stringify(options)}`);
  if (whiteIdx < 0) throw new Error(`白番候補に "${whiteName}" が見つからない: ${JSON.stringify(options)}`);

  await blackSelect.selectOption({ index: blackIdx });
  await page.getByTestId('white-player-select').selectOption({ index: whiteIdx });

  // 対局開始
  await page.getByTestId('create-game-button').click();
}
