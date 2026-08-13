import { test, expect } from '@playwright/test';
import { TEST_STUDENT_A, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupClassroomData, teardownSupabaseRoster, fetchRosterToken } from './helpers/setup';

/**
 * 道場の共有PC（2026-08-13 三村さん）。
 * 道場に通う生徒もネット道場に参加するので、据え置きのPCでは
 * IDを打たずに名前を選ぶだけで入れる。
 *
 * 鍵は教室IDではなく roster_token。教室IDは招待リンクに入っていて生徒全員が
 * 持っているため、それだけで氏名一覧が引けてはいけない。
 */
test.describe('道場の共有PC', () => {
  let classroomId: string;
  let rosterToken: string;

  test.beforeEach(async ({ page }) => {
    classroomId = generateClassroomId('roster');
    await page.goto('/');
    await clearAllData(page);
    await setupClassroomData(page, classroomId);

    // 教室に発行された共有PCの鍵を取る（先生が「道場PC用リンクをコピー」で得るもの）
    rosterToken = await fetchRosterToken(classroomId);
  });

  test.afterEach(async () => {
    await teardownSupabaseRoster(classroomId);
  });

  test('名前を押すだけで入室でき、IDの入力欄は出ない', async ({ page }) => {
    expect(rosterToken, '教室に共有PCの鍵が発行されていない').toMatch(/^[0-9a-f]{24}$/);

    await page.goto(`/?roster=${rosterToken}`);

    // 名簿が出る。IDや教室IDを打つ欄は無い
    await expect(page.getByTestId('roster-list')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('student-id-input')).toHaveCount(0);
    await expect(page.getByTestId('classroom-id-input')).toHaveCount(0);

    const pick = page.getByTestId(`roster-pick-${TEST_STUDENT_A.code}`);
    await expect(pick).toHaveText(TEST_STUDENT_A.name);

    // 名前を押すと、そのまま教室に入る
    await pick.click();
    await expect(
      page.getByText('先生がレッスンを始めるのを待ってください'),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText(`${TEST_STUDENT_A.name} さん`)).toBeVisible();
  });

  test('鍵が違えば名簿は出ない', async ({ page }) => {
    await page.goto('/?roster=deadbeefdeadbeefdeadbeef');
    await expect(page.getByText(/この共有PCの設定が無効です/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('roster-list')).toHaveCount(0);
  });
});
