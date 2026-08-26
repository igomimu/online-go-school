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
