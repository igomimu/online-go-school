import { test, expect } from '@playwright/test';
import { TEST_TEACHER_PASSWORD, TEST_CLASSROOM_NAME, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData } from './helpers/setup';

/**
 * 先生認証はサーバー（validate_teacher_session）が唯一の権威であることの回帰テスト。
 *
 * 2026-06-13 実地で発覚: ローカル localStorage のパスワード照合が先に走るゲートが
 * 残っていたため、サーバー側 TEACHER_PASSWORD_HASH 変更後に正しいPWを入れても
 * 「パスワードが違います」で弾かれてログイン不能になった。
 * （既存E2Eはローカルとサーバーを同じPWに揃えていたため検出できなかった）
 */
test.describe('先生ログイン: サーバー権威', () => {
  test('ローカルに別の旧PWが保存されていても、サーバーの正しいPWでログインできる', async ({ page }) => {
    const classroomId = generateClassroomId('auth');
    await page.goto('/');
    await clearAllData(page);
    // ユーザーのブラウザ状況を再現: ローカルにはサーバーと異なる旧PWが保存済み
    await setupTeacherPassword(page, 'stale-local-password');
    await setupClassroomData(page, classroomId);
    await page.reload();

    await page.getByTestId('teacher-mode-link').click();
    await page.getByTestId('teacher-password-input').fill(TEST_TEACHER_PASSWORD);
    await page.getByTestId('teacher-login-button').click();

    // ClassroomManager に到達できる（ローカル照合に弾かれない）
    await expect(page.getByText(TEST_CLASSROOM_NAME)).toBeVisible({ timeout: 15_000 });
  });

  test('サーバーと一致しないPWではローカル保存と一致してもログインできない', async ({ page }) => {
    await page.goto('/');
    await clearAllData(page);
    // ローカルには 'wrong-pw' が保存済み（旧実装ならローカル照合が通って入れてしまう）
    await setupTeacherPassword(page, 'wrong-pw');
    await page.reload();

    await page.getByTestId('teacher-mode-link').click();
    await page.getByTestId('teacher-password-input').fill('wrong-pw');
    await page.getByTestId('teacher-login-button').click();

    await expect(page.getByText('パスワードがサーバーと一致しません')).toBeVisible({ timeout: 15_000 });
  });
});
