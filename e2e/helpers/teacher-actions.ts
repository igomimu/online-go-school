import { expect, type Page } from '@playwright/test';
import { TEST_CLASSROOM_NAME, TEST_STUDENT_A, TEST_STUDENT_B, TEST_TEACHER_PASSWORD } from './test-data';

/**
 * 先生としてログイン → ClassroomManager画面まで到達
 */
export async function loginAsTeacher(
  page: Page,
  password: string = TEST_TEACHER_PASSWORD,
  classroomName?: string,
): Promise<void> {
  await page.getByTestId('teacher-mode-link').click();
  await page.getByTestId('teacher-password-input').fill(password);
  await page.getByTestId('teacher-login-button').click();
  await page.getByText(classroomName || await currentClassroomName(page)).waitFor({ timeout: 10_000 });
}

/**
 * 教室を開き、ダッシュボード（LiveKit接続完了）まで到達
 */
export async function openClassroomAndConnect(page: Page): Promise<void> {
  const classroomName = await currentClassroomName(page);
  await page.locator('tr', { hasText: classroomName }).locator('button', { hasText: '開く' }).first().click();
  // TeacherDashboardヘッダ到達（実装時の表示は「囲」アイコン + 「三村囲碁オンライン 〜 <教室名>」）
  await page.getByText(/三村囲碁オンライン.*〜/).waitFor({ timeout: 20_000 });
}

async function currentClassroomName(page: Page): Promise<string> {
  return page.evaluate((fallback) => {
    try {
      const e2eName = localStorage.getItem('go-school-e2e-classroom-name');
      if (e2eName) return e2eName;
      const classrooms = JSON.parse(localStorage.getItem('go-school-classrooms') || '[]') as Array<{ name?: string }>;
      return classrooms[0]?.name || fallback;
    } catch {
      return fallback;
    }
  }, TEST_CLASSROOM_NAME);
}

/**
 * 指定した生徒が **LiveKit接続済み状態** で生徒テーブルに現れるまで待つ。
 * StudentTableは未接続の登録生徒もグレー表示するので、data-connected="true"の行を待つ必要がある。
 */
export async function waitForStudentJoined(page: Page, studentId: string, timeout = 20_000): Promise<void> {
  const byId = page.locator(`tr[data-connected="true"][data-student-id="${studentId}"]`).first();
  const name = studentNameFromId(studentId);
  const byName = name ? page.locator('tr[data-connected="true"]').filter({ hasText: name }).first() : null;
  try {
    await byId.waitFor({ timeout: Math.min(timeout, 5_000) });
  } catch {
    if (!byName) throw new Error(`Connected student row not found: ${studentId}`);
    await byName.waitFor({ timeout });
  }
}

/**
 * 「回線復旧」ボタンをクリックして、ラベルが「復旧中...」に変わったあと
 * 「回線復旧」に戻るまでを観測する。
 * 非同期トグル（isReconnecting state）が動いていることを保証する。
 */
export async function clickReconnectAndWaitCycle(page: Page, timeout = 30_000): Promise<void> {
  const button = page.locator('button').filter({ hasText: /回線復旧|復旧中/ });
  // 押す前は「回線復旧」
  await expect(button).toHaveText(/回線復旧/, { timeout: 5_000 });
  await expect(button).toBeEnabled();
  await button.click();
  // 一瞬で「復旧中...」+ disabled
  await expect(button).toHaveText(/復旧中/, { timeout: 3_000 });
  await expect(button).toBeDisabled();
  // 復旧完了後に元のラベルに戻る
  await expect(button).toHaveText(/回線復旧/, { timeout });
  await expect(button).toBeEnabled();
}

/**
 * StudentTable で指定生徒の行の「開く」ボタンを取得する。
 * disabled / enabled の状態確認や click に使う。
 */
export function getOpenStudentButton(page: Page, studentId: string) {
  const name = studentNameFromId(studentId);
  const row = name
    ? page.locator(`tr[data-student-id="${studentId}"], tr`).filter({ hasText: name }).first()
    : page.locator(`tr[data-student-id="${studentId}"]`).first();
  return row.locator('button', { hasText: '開く' });
}

function studentNameFromId(studentId: string): string | undefined {
  if (studentId === TEST_STUDENT_A.id || studentId === TEST_STUDENT_A.code) return TEST_STUDENT_A.name;
  if (studentId === TEST_STUDENT_B.id || studentId === TEST_STUDENT_B.code) return TEST_STUDENT_B.name;
  return undefined;
}

/**
 * 対局盤ビュー（GameObserverPanel / 自動オープンされた対局盤、GameBoard onBack有り）に
 * 遷移したことを確認する。onBack時のみ出現する「閉じてホーム」ボタンを目印に使う
 * （8c6bbef で「← 戻る」から改名）。
 */
export async function waitForObserverPanel(page: Page, timeout = 10_000): Promise<void> {
  await expect(page.getByRole('button', { name: '閉じてホーム' })).toBeVisible({ timeout });
}

/**
 * 対局盤ビューを「閉じてホーム」で閉じ、TeacherDashboardに戻るまで待つ。
 * d976887以降、先生自身が対局者の場合は対局作成直後に盤が自動で開くため、
 * ダッシュボード側のUI（StudentTable等）を検証する前にこれで戻る必要がある。
 */
export async function closeGameBoardToHome(page: Page, timeout = 10_000): Promise<void> {
  await page.getByRole('button', { name: '閉じてホーム' }).click();
  await page.getByText(/三村囲碁オンライン.*〜/).waitFor({ timeout });
}

/**
 * 多面打ちビュー（1盤表示）に遷移したことを確認する。
 * 2026-07-14以降、先生自身が対局者の対局は全画面盤ではなく多面打ちビューで開く
 * （対局作成を重ねるだけで盤が増える動線に一本化）。
 */
export async function waitForSimulBoard(page: Page, timeout = 10_000): Promise<void> {
  await expect(page.getByTestId('simul-active-board')).toBeVisible({ timeout });
}

/**
 * 多面打ちビューを「戻る」で閉じ、ダッシュボード本体（サムネイルグリッド）に戻る。
 */
export async function closeSimulToHome(page: Page, timeout = 10_000): Promise<void> {
  await page.getByTestId('simul-back').click();
  await expect(page.getByTestId('simul-active-board')).toBeHidden({ timeout });
}

/**
 * 検討モードに突入するため、SGF読込ボタン経由で隠しfile inputにSGF文字列を流し込む。
 * 9路 + 1手だけの最小SGFをデフォルトで使う。
 */
export async function loadSgfForReview(
  page: Page,
  sgf: string = '(;FF[4]GM[1]SZ[9];B[ee])',
): Promise<void> {
  const fileChooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'SGF読込', exact: true }).click();
  const chooser = await fileChooserPromise;
  await chooser.setFiles({
    name: 'review.sgf',
    mimeType: 'application/x-go-sgf',
    buffer: Buffer.from(sgf, 'utf-8'),
  });
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
