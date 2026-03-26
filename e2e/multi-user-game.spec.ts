import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { TEST_CLASSROOM_ID, TEST_STUDENT_A, TEST_TEACHER_PASSWORD } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData } from './helpers/setup';

test.describe('マルチユーザー対局フロー', () => {
  let teacherContext: BrowserContext;
  let studentContext: BrowserContext;
  let teacherPage: Page;
  let studentPage: Page;

  test.beforeEach(async ({ browser }) => {
    teacherContext = await browser.newContext();
    studentContext = await browser.newContext();
    teacherPage = await teacherContext.newPage();
    studentPage = await studentContext.newPage();

    // 先生側セットアップ
    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage);
    await teacherPage.reload();

    // 生徒側セットアップ
    await studentPage.goto('/');
    await clearAllData(studentPage);
    await setupClassroomData(studentPage);
    await studentPage.reload();
  });

  test.afterEach(async () => {
    await teacherContext?.close();
    await studentContext?.close();
  });

  test('先生が対局作成 → 生徒が参加 → 着手が同期される', async () => {
    // コンソールログを収集
    teacherPage.on('console', msg => console.log('[TEACHER]', msg.text()));
    studentPage.on('console', msg => console.log('[STUDENT]', msg.text()));

    // === 先生ログイン ===
    await teacherPage.getByTestId('teacher-mode-link').click();
    await teacherPage.getByTestId('teacher-password-input').fill(TEST_TEACHER_PASSWORD);
    await teacherPage.getByTestId('teacher-login-button').click();

    // ClassroomManager → テスト教室の「開く」をクリック
    await teacherPage.getByText('E2Eテスト教室').waitFor({ timeout: 5_000 });
    await teacherPage.locator('button', { hasText: '開く' }).first().click();

    // TeacherDashboard（LiveKit接続完了）を待つ
    await teacherPage.getByText('三村囲碁オンライン', { exact: true }).waitFor({ timeout: 20_000 });

    // 先生のルーム名をデバッグ
    const teacherRoom = await teacherPage.evaluate(() => {
      // @ts-ignore
      return document.title + ' | roomName in DOM';
    });
    console.log('Teacher connected. Page title:', teacherRoom);

    // === 生徒ログイン ===
    await studentPage.getByTestId('student-id-input').fill(TEST_STUDENT_A.id);
    await studentPage.getByTestId('classroom-id-input').fill(TEST_CLASSROOM_ID);
    await studentPage.getByTestId('student-login-button').click();

    // 生徒接続をデバッグ: ヘッダーの接続状態を待つ
    // "先生が対局を作成するのをお待ちください" OR 接続エラーが出る
    const studentResult = await Promise.race([
      studentPage.getByText('先生が対局を作成するのをお待ちください').waitFor({ timeout: 25_000 }).then(() => 'lobby'),
      studentPage.getByText('接続に失敗しました').waitFor({ timeout: 25_000 }).then(() => 'error'),
      studentPage.waitForTimeout(25_000).then(() => 'timeout'),
    ]);
    console.log('Student connection result:', studentResult);

    if (studentResult === 'error') {
      const errorText = await studentPage.locator('text=接続に失敗しました').textContent();
      console.log('Connection error:', errorText);
    }

    // 生徒ページのスクリーンショットを取得
    if (studentResult !== 'lobby') {
      const screenshotBuf = await studentPage.screenshot();
      console.log('Student page screenshot taken, size:', screenshotBuf.length);
      // HTMLの一部を出力
      const bodyText = await studentPage.evaluate(() => document.body.innerText.substring(0, 500));
      console.log('Student page body:', bodyText);
      throw new Error(`Student failed to reach lobby: ${studentResult}`);
    }

    // === 両者の接続を確認 ===
    // 生徒ヘッダーで「N人接続中」を待つ
    await expect(studentPage.getByText(/[1-9]人接続中/)).toBeVisible({ timeout: 20_000 });
    // 先生側で生徒を待つ
    await teacherPage.getByText(TEST_STUDENT_A.name).first().waitFor({ timeout: 10_000 });

    // デバッグ: participants state の内容
    const debugParticipants = await teacherPage.getByTestId('debug-participants').textContent();
    console.log('DEBUG participants:', debugParticipants);
    const localId = await teacherPage.evaluate(() => {
      // @ts-ignore
      return document.querySelector('[data-testid="debug-participants"]')?.parentElement?.querySelector('[data-local-id]')?.getAttribute('data-local-id') || 'N/A';
    });
    console.log('DEBUG localIdentity:', localId);

    // === 先生: 対局作成 ===
    await teacherPage.getByTestId('create-game-toolbar-button').click();
    await teacherPage.getByTestId('create-game-button').waitFor({ timeout: 5_000 });

    // 9路盤を選択
    await teacherPage.getByRole('button', { name: '9路', exact: true }).click();

    // 生徒を黒番に選択
    const blackSelect = teacherPage.getByTestId('black-player-select');
    // デバッグ: select内の全optionを即座にダンプ
    const immediateOptions = await blackSelect.locator('option').allTextContents();
    console.log('Immediate black player options:', immediateOptions);
    // 2つ目のoptionを15秒待つ（participantsの更新を待つ）
    try {
      await blackSelect.locator('option').nth(1).waitFor({ timeout: 15_000 });
    } catch {
      // タイムアウト時: 閉じて再度開く
      console.log('No 2nd option found, retrying dialog...');
      await teacherPage.locator('.fixed .lucide-x').first().click();
      await teacherPage.waitForTimeout(3_000);
      await teacherPage.getByTestId('create-game-toolbar-button').click();
      await teacherPage.getByTestId('create-game-button').waitFor({ timeout: 5_000 });
      await teacherPage.getByRole('button', { name: '9路', exact: true }).click();
      await blackSelect.locator('option').nth(1).waitFor({ timeout: 10_000 });
    }
    const options = await blackSelect.locator('option').allTextContents();
    console.log('Black player options:', options);
    const studentIdx = options.findIndex(o => o.includes(TEST_STUDENT_A.name));
    const teacherIdx = options.findIndex(o => o.includes('先生'));
    if (studentIdx >= 0) await blackSelect.selectOption({ index: studentIdx });
    if (teacherIdx >= 0) await teacherPage.getByTestId('white-player-select').selectOption({ index: teacherIdx });

    // 対局開始
    await teacherPage.getByTestId('create-game-button').click();

    // === 生徒: 対局が表示される ===
    await studentPage.getByText('対局中').waitFor({ timeout: 10_000 });
    await studentPage.getByText('碁盤を開く').click();

    // === 生徒: 自分のターン確認 ===
    await studentPage.getByText('あなたの番です').waitFor({ timeout: 5_000 });

    // === 生徒: (5,5) に着手 ===
    const board = studentPage.getByTestId('go-board');
    await board.locator('[data-cell="5-5"]').click();

    // === 検証: 石が表示される ===
    await expect(studentPage.locator('[data-stone="5-5"]')).toBeVisible({ timeout: 10_000 });

    // 手数が1手目に更新
    await expect(studentPage.getByTestId('move-count')).toContainText('1手目');
  });
});
