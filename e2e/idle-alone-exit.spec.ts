import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { TEST_STUDENT_A, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsStudent } from './helpers/student-actions';
import { loginAsTeacher, openClassroomAndConnect, waitForStudentJoined } from './helpers/teacher-actions';

/**
 * 授業が終わったあと、生徒のタブが開けっぱなしで残る場合の始末。
 *
 * LiveKit の参加者分は「繋いでいた時間」で数えられるので、開けっぱなしのタブ 1 枚が
 * 1 日 1,440 分を食う。タブを閉じたときは disconnectOnPageLeave が効くが、
 * 開いたまま放置されると効かない。
 *
 * 授業を巻き込まないよう、条件は「自分以外が居ない」かつ「何も触っていない」の二つ重ね。
 */


/**
 * 先生が抜けたことが生徒側に伝わるまで待つ。
 * 生徒ページは時計を止めているので、少しずつ進めながら待つ必要がある。
 * 「N人接続中」は自分を除いた人数なので、先生が抜ければ 0。
 */
async function waitForTeacherGone(page: Page): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if (await page.getByText('0人接続中').isVisible()) return;
    await page.clock.runFor(3_000);
    await page.waitForTimeout(500);
  }
  throw new Error('先生が抜けたことが生徒側に伝わらなかった');
}

test.describe('一人きりの放置', () => {
  let teacherContext: BrowserContext;
  let studentContext: BrowserContext;
  let teacherPage: Page;
  let studentPage: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('idle');
    teacherContext = await browser.newContext();
    studentContext = await browser.newContext();

    teacherPage = await teacherContext.newPage();
    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.reload();
    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);

    studentPage = await studentContext.newPage();
    await studentPage.clock.install();
    await studentPage.goto('/');
    await clearAllData(studentPage);
    await studentPage.reload();
    await loginAsStudent(studentPage, { studentCode: TEST_STUDENT_A.code, classroomId });
    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);
  });

  test.afterEach(async () => {
    await studentContext?.close();
    await teacherContext?.close();
    await teardownSupabaseRoster(classroomId);
  });

  test('先生が居る間は、どれだけ触らなくても出ない', async () => {
    await studentPage.clock.runFor(30 * 60 * 1000);

    // 「出ていない」だけでは、繋がりが死んで判定が止まっていても緑になる。
    // 接続が生きている（先生が見えている）ことまで確かめる。
    // 「N人接続中」は自分を除いた人数なので、先生だけなら 1。
    await expect(studentPage.getByText('1人接続中')).toBeVisible({ timeout: 15_000 });
    await expect(studentPage.getByRole('heading', { name: '教室から出ました' })).toBeHidden();
  });

  test('先生が抜けて一人きりになったら15分で出る', async () => {
    // ページ遷移で pagehide → disconnectOnPageLeave が効き、LiveKit に「抜けた」が即伝わる。
    // context.close() だと接続が切れたことを LiveKit 側のタイムアウトで待つことになる。
    await teacherPage.goto('about:blank');
    await waitForTeacherGone(studentPage);

    // 14分では出ない（授業直後に少し残っただけの生徒を追い出さない）
    await studentPage.clock.runFor(14 * 60 * 1000);
    await expect(studentPage.getByRole('heading', { name: '教室から出ました' })).toBeHidden();

    // 15分を越えると出る
    await studentPage.clock.runFor(2 * 60 * 1000);
    await expect(studentPage.getByRole('heading', { name: '教室から出ました' })).toBeVisible({ timeout: 15_000 });
    await expect(studentPage.getByText('こわれたのではありません')).toBeVisible();
    await studentPage.screenshot({ path: 'test-results/idle-exit-notice.png', fullPage: true });
  });

  test('一人きりでも触っていれば出ない', async () => {
    // ページ遷移で pagehide → disconnectOnPageLeave が効き、LiveKit に「抜けた」が即伝わる。
    // context.close() だと接続が切れたことを LiveKit 側のタイムアウトで待つことになる。
    await teacherPage.goto('about:blank');
    await waitForTeacherGone(studentPage);

    // 期限の手前で一度触る → そこから数え直しになる
    await studentPage.clock.runFor(14 * 60 * 1000);
    await studentPage.mouse.click(5, 5);
    await studentPage.clock.runFor(5 * 60 * 1000);

    await expect(studentPage.getByRole('heading', { name: '教室から出ました' })).toBeHidden();
  });
});
