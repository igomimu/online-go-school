import { test, expect } from '@playwright/test';
import { TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher, openClassroomAndConnect } from './helpers/teacher-actions';

/**
 * 「新しい版が出ています」の帯が、最新の版を開いているのに出てしまわないか。
 *
 * 2026-08-26: version.json の40文字と、アプリが埋め込む7文字を
 * そのまま比べたため、最新を開いていても必ず出続け、読み込み直しても消えず
 * 操作の邪魔になった。本番で実際に開いて確かめる。
 */
test('最新の版を開いているとき、更新の帯は出ない', async ({ page }) => {
  // 🔴 開発サーバーは起動した時点のコミットハッシュをアプリへ埋め込むため、
  // その後ブランチを切り替えると version.json と必ず食い違い、帯が出たままになる。
  // これは配信されたものを開いて確かめる性質の検証なので、配信先を指定したときだけ走らせる。
  //   例: BASE_URL=https://online.mimura15.jp npx playwright test e2e/version-banner.spec.ts
  test.skip(!process.env.BASE_URL, '配信先(BASE_URL)を指定したときだけ確かめる');

  const classroomId = generateClassroomId('ver');
  try {
    await page.goto('/');
    await clearAllData(page);
    await setupTeacherPassword(page, TEST_TEACHER_PASSWORD);
    await setupClassroomData(page, classroomId);
    await page.reload();
    await loginAsTeacher(page);
    await openClassroomAndConnect(page);

    // 版の確認は入室直後に走る。少し待ってから見る
    await page.waitForTimeout(5000);
    await expect(page.getByText('新しい版が出ています')).toBeHidden();
  } finally {
    await teardownSupabaseRoster(classroomId);
  }
});
