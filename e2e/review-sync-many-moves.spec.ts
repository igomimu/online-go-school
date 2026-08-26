import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { TEST_STUDENT_A, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher, openClassroomAndConnect, loadSgfForReview } from './helpers/teacher-actions';
import { loginAsStudent } from './helpers/student-actions';

/**
 * 検討で手を続けて進めたとき、生徒の盤が最後まで付いてくるか。
 *
 * 2026-08-26 の実授業で「20手目あたりで生徒側だけ止まり、以降の操作が届かない」
 * が出た。配信の経路そのものは動いているのに、途中から落ちる種類の壊れ方は
 * 送信の回数制限に当たったときの症状で、先生側は何事もなく操作できてしまう。
 *
 * 先生が手を進める速さは人の操作より速くしてあり、上限に当たりやすい条件で回す。
 */
test.describe('検討の同期: 手を続けて進める', () => {
  let teacherContext: BrowserContext;
  let studentContext: BrowserContext;
  let teacherPage: Page;
  let studentPage: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('review-sync');
    teacherContext = await browser.newContext();
    studentContext = await browser.newContext();
    teacherPage = await teacherContext.newPage();
    studentPage = await studentContext.newPage();

    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.reload();
    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);
    await loginAsStudent(studentPage, { studentCode: TEST_STUDENT_A.code, classroomId });

    teacherPage.on('console', (m) => {
      const t = m.text();
      if (/rtc|rate|limit|error|fail/i.test(t)) console.log(`[先生] ${t.slice(0, 200)}`);
    });
    studentPage.on('console', (m) => {
      const t = m.text();
      if (/rtc|rate|limit|error|fail/i.test(t)) console.log(`[生徒] ${t.slice(0, 200)}`);
    });
  });

  test.afterEach(async () => {
    await teacherContext?.close();
    await studentContext?.close();
    if (classroomId) await teardownSupabaseRoster(classroomId);
  });

  test('30手続けて打っても、生徒の盤が最後の手まで付いてくる', async () => {
    const review = await loadSgfForReview(teacherPage, '(;FF[4]GM[1]SZ[19])');
    await expect(review.getByText('検討モード')).toBeVisible({ timeout: 15_000 });

    const board = review.getByTestId('go-board');
    await expect(review.getByText('0手目')).toBeVisible({ timeout: 10_000 });

    // 人が押すより速く、盤の上を移動しながら打つ（カーソル共有も同時に飛ぶ）
    const cells: Array<[number, number]> = [];
    for (let i = 0; i < 30; i++) {
      cells.push([(i % 15) + 2, Math.floor(i / 15) + 3]);
    }
    for (const [x, y] of cells) {
      await board.locator(`[data-cell="${x}-${y}"]`).click({ delay: 0 });
    }

    await expect(review.getByText('30手目')).toBeVisible({ timeout: 15_000 });

    // 生徒の盤にも最後の手が届いているか。石の数で確かめる
    const studentBoard = studentPage.getByTestId('go-board');
    await expect(studentBoard).toBeVisible({ timeout: 15_000 });
    await expect(async () => {
      const stones = await studentBoard.locator('[data-stone]').count();
      expect(stones).toBe(30);
    }).toPass({ timeout: 20_000 });
  });

});
