import { test, expect } from '@playwright/test';

/**
 * 生徒に配る「参加リンク」。初めて使う大人がコードも教室IDも打たずに済むこと、
 * そして配布済みの古いリンク（role=STUDENT 付き）が 403 で死なないことを見る。
 * 教室に入るところまでは見ない（先生の在室が要るため）。
 */
test.describe('参加リンク', () => {
  test('リンクを開くとログイン画面に生徒コードが記入済みで出る', async ({ page }) => {
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
