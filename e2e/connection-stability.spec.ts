import { test, expect } from '@playwright/test';
import { TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher, openClassroomAndConnect } from './helpers/teacher-actions';

/**
 * 何もしていないのに「回線が不安定です」が出続けないか。
 *
 * 2026-08-26: RealtimeKit は socket の状態を細かく知らせてくる。そのまま
 * 画面へ流したので、一瞬の揺れでも朱く出て、実際より回線が悪く見えた
 * （LiveKit の頃より明らかに増えたと指摘を受けた）。
 */
test('つないだまま置いても、回線の表示が朱くならない', async ({ page }) => {
  const classroomId = generateClassroomId('stab');
  try {
    await page.goto('/');
    await clearAllData(page);
    await setupTeacherPassword(page, TEST_TEACHER_PASSWORD);
    await setupClassroomData(page, classroomId);
    await page.reload();
    await loginAsTeacher(page);
    await openClassroomAndConnect(page);

    const status = page.getByTestId('connection-status');
    await expect(status).toBeVisible({ timeout: 15_000 });
    await expect(status).toHaveText('回線 正常', { timeout: 20_000 });

    // 40秒ほど置いて、その間ずっと正常のままか
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(5000);
      seen.push((await status.innerText()).trim());
    }
    expect(seen.filter((t) => t !== '回線 正常')).toEqual([]);
  } finally {
    await teardownSupabaseRoster(classroomId);
  }
});
