import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher, openClassroomAndConnect, loadSgfForReview } from './helpers/teacher-actions';

// 回帰テスト: 検討モードの碁盤操作をpokekataに揃えた(2026-07-23)。
// マウスホイールでの手順送り/戻り、Delete/Ctrl+Zでの着手取り消し、
// チャット入力中はショートカットを無効化する安全対策を検証する。

test.describe('検討モードの碁盤操作(pokekata踏襲)', () => {
  let teacherContext: BrowserContext;
  let teacherPage: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('review-controls');
    teacherContext = await browser.newContext();
    teacherPage = await teacherContext.newPage();

    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.reload();
  });

  test.afterEach(async () => {
    await teacherContext?.close();
    if (classroomId) await teardownSupabaseRoster(classroomId);
  });

  test('着手→Delete取り消し→ホイールで手順送り/戻りが機能する', async () => {
    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);
    await loadSgfForReview(teacherPage, '(;FF[4]GM[1]SZ[9])');
    await expect(teacherPage.getByText('検討モード')).toBeVisible({ timeout: 15_000 });

    const board = teacherPage.getByTestId('go-board');
    await expect(teacherPage.getByText('0手目')).toBeVisible({ timeout: 10_000 });

    // 着手(4,4) → 1手目
    await board.locator('[data-cell="4-4"]').click();
    await expect(teacherPage.getByText('1手目')).toBeVisible({ timeout: 5_000 });

    // Deleteキーで取り消し → 0手目に戻る
    await teacherPage.keyboard.press('Delete');
    await expect(teacherPage.getByText('0手目')).toBeVisible({ timeout: 5_000 });

    // 再度着手して Ctrl+Z でも取り消せることを確認
    await board.locator('[data-cell="4-4"]').click();
    await expect(teacherPage.getByText('1手目')).toBeVisible({ timeout: 5_000 });
    await teacherPage.keyboard.press('Control+z');
    await expect(teacherPage.getByText('0手目')).toBeVisible({ timeout: 5_000 });

    // 再度着手してから、ホイールで戻る/進む
    await board.locator('[data-cell="4-4"]').click();
    await expect(teacherPage.getByText('1手目')).toBeVisible({ timeout: 5_000 });

    await board.hover();
    await teacherPage.mouse.wheel(0, -100); // 上スクロール = 戻る
    await expect(teacherPage.getByText('0手目')).toBeVisible({ timeout: 5_000 });

    await board.hover();
    await teacherPage.mouse.wheel(0, 100); // 下スクロール = 進む
    await expect(teacherPage.getByText('1手目')).toBeVisible({ timeout: 5_000 });
  });

  test('矢印キーで手順送り/戻り、チャット入力中は無効化される', async () => {
    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);
    await loadSgfForReview(teacherPage, '(;FF[4]GM[1]SZ[9];B[ee])');
    await expect(teacherPage.getByText('検討モード')).toBeVisible({ timeout: 15_000 });
    // SGF読込直後はcurrentNode=root(0手目)。1手目に進むにはArrowRightが必要。
    await expect(teacherPage.getByText('0手目')).toBeVisible({ timeout: 10_000 });

    // ArrowRightで進む
    await teacherPage.keyboard.press('ArrowRight');
    await expect(teacherPage.getByText('1手目')).toBeVisible({ timeout: 5_000 });

    // ArrowLeftで戻る
    await teacherPage.keyboard.press('ArrowLeft');
    await expect(teacherPage.getByText('0手目')).toBeVisible({ timeout: 5_000 });

    // 再度進めてチャット入力中の無効化テストに備える
    await teacherPage.keyboard.press('ArrowRight');
    await expect(teacherPage.getByText('1手目')).toBeVisible({ timeout: 5_000 });

    // チャット入力欄にフォーカスした状態でArrowLeftを押しても手順が動かないこと
    // (8a387f6以降「碁盤のみ最大化」がデフォルトなので操作パネルを開く必要がある)
    const showPanelButton = teacherPage.getByRole('button', { name: '操作パネルを表示' });
    if (await showPanelButton.count() > 0) {
      await showPanelButton.click();
    }
    const chatInput = teacherPage.locator('input[type="text"]').first();
    if (await chatInput.count() > 0) {
      await chatInput.click();
      await teacherPage.keyboard.press('ArrowLeft');
      await expect(teacherPage.getByText('1手目')).toBeVisible({ timeout: 3_000 });
    }
  });
});
