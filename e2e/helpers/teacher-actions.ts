import { expect, type Page } from '@playwright/test';

/**
 * ツールバーの副操作はドロップダウンにまとまっている（2026-08-13）。
 * メニューを開いてから項目を押す。
 */
export async function clickToolbarMenuItem(
  page: Page,
  menu: '教材' | '生徒管理',
  item: string,
): Promise<void> {
  await page.getByRole('button', { name: `${menu} ▾`, exact: true }).click();
  await page.getByRole('button', { name: item, exact: true }).click();
}
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
/**
 * 生徒の盤（中央のサムネイル）。対局が無ければ存在しない。
 *
 * 以前は生徒一覧の行に「開く」ボタンがあったが、2dcff9e で
 * 「盤を開く操作は中央の碁盤クリックへ一本化」された。
 */
export function getStudentBoard(page: Page, studentId: string) {
  return page.getByTestId(`open-board-${studentId}`);
}

/** 生徒の枠そのもの。対局の有無にかかわらず必ずある。 */
export function getStudentBoardSlot(page: Page, studentId: string) {
  return page.getByTestId(`board-slot-${studentId}`);
}

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
 * 講師専用の対局別ウィンドウ（popup）を捕捉する。
 * 2026-07-15以降、先生自身が対局者の対局は教室ホーム画面に埋め込まず、
 * 常に別ウィンドウ1枚（手番になるたびに自動切替）で開く。
 * `action` は対局作成/再開など、別ウィンドウを誘発するクリック操作。
 * popupイベントはクリックより前にリスナーを張っておく必要があるため、
 * Promise.allでactionと同時に待ち受ける。
 */
export async function waitForTeacherGameWindow(
  page: Page,
  action: () => Promise<void>,
  timeout = 10_000,
): Promise<Page> {
  const [popup] = await Promise.all([
    page.waitForEvent('popup', { timeout }),
    action(),
  ]);
  await expect(popup.getByTestId('simul-active-board')).toBeVisible({ timeout });
  return popup;
}

/**
 * 既に取得済みの講師専用対局別ウィンドウ(popup)で、1盤表示(simul-active-board)が
 * 見えていることを確認する。
 */
export async function waitForSimulBoard(page: Page, timeout = 10_000): Promise<void> {
  await expect(page.getByTestId('simul-active-board')).toBeVisible({ timeout });
}

/**
 * 検討モードに突入するため、SGF読込ボタン経由で隠しfile inputにSGF文字列を流し込む。
 * 9路 + 1手だけの最小SGFをデフォルトで使う。
 */
/**
 * SGF を読み込んで検討を開始し、**検討画面が描かれているページ**を返す。
 *
 * 先生の検討は別ウィンドウに出る（2026-08-05）。ポップアップが開けなかった場合は
 * 元のページに全面表示されるので、その場合は同じページを返す。
 */
export async function loadSgfForReview(
  page: Page,
  sgf: string = '(;FF[4]GM[1]SZ[9];B[ee])',
): Promise<Page> {
  const fileChooserPromise = page.waitForEvent('filechooser');
  const popupPromise = page.waitForEvent('popup', { timeout: 10_000 }).catch(() => null);
  await clickToolbarMenuItem(page, '教材', 'SGF読込');
  const chooser = await fileChooserPromise;
  await chooser.setFiles({
    name: 'review.sgf',
    mimeType: 'application/x-go-sgf',
    buffer: Buffer.from(sgf, 'utf-8'),
  });
  const popup = await popupPromise;
  if (!popup) return page;
  await popup.waitForLoadState('domcontentloaded');
  if (!popup.isClosed()) return popup;
  // 掴んだウィンドウが閉じていたら、開き直された方を拾う
  const alive = page.context().pages().filter(p => p !== page && !p.isClosed());
  return alive.length > 0 ? alive[alive.length - 1] : page;
}

/**
 * 対局作成ダイアログを開いて条件を入れ、対局開始をクリック
 * expectedPlayersCount: 先生+参加生徒数（先生1+生徒2なら3）
 */
/**
 * 対局作成ダイアログを開いて条件を入れ、対局開始をクリック。
 *
 * 2026-08-23 の `a107af9`「対局作成とNHK杯時計を再設計」でUIが変わり、
 * このヘルパーは置き去りになっていた（碁盤サイズが「9路」ボタンから
 * プルダウンへ、対局者は黒白2つの選択から「自分の色＋相手1人」へ）。
 * そのため createGame を使う E2E 13本が丸ごと落ちたままだった（2026-08-26 に修理）。
 *
 * blackName / whiteName は「その名前がその色になる」という指定。
 * 先生が入っていれば先生の色を、生徒同士なら「生徒同士対局」を使って組む。
 */
export async function createGame(
  page: Page,
  opts: {
    blackName: string;
    whiteName: string;
    boardSize?: 9 | 13 | 19;
    /** 先生を含む参加人数。候補がそろうまで待つのに使う */
    expectedPlayersCount?: number;
    // 時間設定。未指定の項目は DEFAULT_TIME_SETTINGS（持ち時間0分・秒読み30秒×1）のまま
    mainMinutes?: number;
    byoyomiPeriods?: number;
    /** 秒読みの秒数。選べるのは 10/20/30/40/50/60 */
    byoyomiSeconds?: 10 | 20 | 30 | 40 | 50 | 60;
  },
): Promise<void> {
  const {
    blackName, whiteName, boardSize = 9, expectedPlayersCount,
    mainMinutes, byoyomiPeriods, byoyomiSeconds,
  } = opts;

  await page.getByTestId('create-game-toolbar-button').click();
  await page.getByTestId('create-game-button').waitFor({ timeout: 5_000 });

  await page.getByTestId('board-size-select').selectOption(String(boardSize));

  // 「自分」は先生（生徒同士対局にすると先頭の生徒に入れ替わる）。
  // 🔴 自分が誰かを表示名の一致で判定してはいけない。呼び出し側は '先生' のような
  // 呼び名を渡すが、画面には「三村九段」のような表示名が出る（2026-08-26）。
  // 相手の候補に誰が居るかで決める。
  const opponent = page.getByTestId('opponent-player-select');
  await expect(opponent.locator('option')).not.toHaveCount(0, { timeout: 20_000 });

  // 対局者の候補は RTC の参加者から作られる。生徒テーブルの「接続中」が先に立っても
  // 参加者一覧がまだ揃っていないことがあり、片方の生徒が候補に出ないまま進んで
  // 「相手の候補に見つからない」で落ちていた（2026-08-27）。
  // 候補（自分を除く全員）が人数分そろうまで待つ。
  if (expectedPlayersCount !== undefined) {
    await expect
      .poll(async () => await opponent.locator('option').count(), { timeout: 25_000 })
      .toBeGreaterThanOrEqual(expectedPlayersCount - 1);
  }

  const optionsNow = await opponent.locator('option').allTextContents();
  const hasBlack = optionsNow.some((o) => o.includes(blackName));
  const hasWhite = optionsNow.some((o) => o.includes(whiteName));

  if (hasBlack && hasWhite) {
    // 指定の2人が両方とも「相手」側に居る＝生徒同士の対局
    await page.getByTestId('student-vs-student-checkbox').check();
    await expect(opponent.locator('option')).not.toHaveCount(0, { timeout: 10_000 });
  }

  // 🔴 どちらが「自分」になるかは画面が決める。生徒同士対局に切り替えると、
  // それまで相手だった生徒が「自分」に繰り上がり、相手はもう一方に移る
  // （GameCreationDialog.handleStudentVsStudentChange）。ここで
  // 「自分＝黒・相手＝白」と決め打つと、順序が逆のときに相手が候補から消えて
  // 「相手の候補に見つからない」で落ちる（2026-09-05）。候補に残っているほうを相手とする。
  const finalOptions = await opponent.locator('option').allTextContents();
  const blackIdx = finalOptions.findIndex((o) => o.includes(blackName));
  const whiteIdx = finalOptions.findIndex((o) => o.includes(whiteName));
  if (blackIdx < 0 && whiteIdx < 0) {
    throw new Error(
      `相手の候補に "${blackName}" も "${whiteName}" も見つからない: ${JSON.stringify(finalOptions)}`,
    );
  }
  // 相手が黒なら自分は白、相手が白なら自分は黒
  const opponentIsBlack = blackIdx >= 0;
  const selfColor: 'BLACK' | 'WHITE' = opponentIsBlack ? 'WHITE' : 'BLACK';

  await page.getByRole('radio', { name: selfColor === 'BLACK' ? '黒' : '白' }).check();
  await opponent.selectOption({ index: opponentIsBlack ? blackIdx : whiteIdx });

  // 🔴 時間設定は a107af9「対局作成とNHK杯時計を再設計」(2026-08-23) で select になった。
  // それ以前は number 入力で、ここは `input[type=number]` の先頭を埋めていたが、
  // 新しい画面でその欄はコミの自由入力しかなく、持ち時間はどこにも入っていなかった。
  if (mainMinutes !== undefined || byoyomiPeriods !== undefined || byoyomiSeconds !== undefined) {
    await page.getByTestId('time-limit-checkbox').check();
    await page.getByTestId('nhk-style-checkbox').uncheck();
    if (mainMinutes !== undefined) {
      await page.getByLabel('持ち時間（分）').selectOption(String(mainMinutes));
    }
    if (byoyomiPeriods !== undefined) {
      await page.getByLabel('秒読み回数').selectOption(String(byoyomiPeriods));
    }
    if (byoyomiSeconds !== undefined) {
      await page.getByLabel('秒読み（秒/手）').selectOption(String(byoyomiSeconds));
    }
  }

  // 対局開始
  await page.getByTestId('create-game-button').click();
}
