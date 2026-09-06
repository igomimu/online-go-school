import { test, expect } from '@playwright/test';

/**
 * 生徒に配る「参加リンク」。押すだけでその生徒としてログインできること、
 * 失敗したときは記入済みのログイン画面に留まること、そして配布済みの
 * 古いリンク（role=STUDENT 付き）が 403 で死なないことを見る。
 * 先生の在室は要らない（ログインの先は待機画面）。
 */
test.describe('参加リンク', () => {
  test('リンクを開くだけでログインする（デモ教室）', async ({ page }) => {
    await page.goto('/?classroomId=DEMO01&code=demo01');

    // 何も押さずに教室へ入る
    await expect(page.getByTestId('student-id-input')).toHaveCount(0);
    await expect(page.getByText('あおい')).toBeVisible();
  });

  test('コードが通らないときは記入済みのログイン画面に留まる', async ({ page }) => {
    await page.goto('/?classroomId=CLS-LINK-TEST&code=1234');

    await expect(page.getByTestId('student-id-input')).toHaveValue('1234');
    await expect(page.getByTestId('prefilled-notice')).toBeVisible();
    await expect(page.getByTestId('student-login-button')).toBeVisible();
    // 教室IDの入力欄は出さない（リンクの教室に接続する）
    await expect(page.getByText('参加リンクの教室')).toBeVisible();
  });

  test('古い形式のリンク（role=STUDENT）も、失敗せずログイン画面に着地する', async ({ page }) => {
    await page.goto(
      '/?role=STUDENT&room=go-CLS-LINK-TEST&classroomId=CLS-LINK-TEST&studentId=1234&studentName=%E3%83%86%E3%82%B9%E3%83%88',
    );

    await expect(page.getByTestId('student-id-input')).toHaveValue('1234');
    await expect(page.getByText('接続に失敗しました')).toHaveCount(0);
  });
});
