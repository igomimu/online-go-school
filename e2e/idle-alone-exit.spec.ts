import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { TEST_STUDENT_A, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsStudent } from './helpers/student-actions';

/**
 * 一人きりのまま放置された端末が、自分から教室を出るか。
 *
 * LiveKit の参加者分は「繋いでいた時間」で数えられるので、開けっぱなしのタブ 1 枚が
 * 1 日 1,440 分を食う。閉じたときは disconnectOnPageLeave が効くが、開けっぱなしには効かない。
 * 授業を巻き込まないよう、条件は「自分以外が居ない」かつ「何も触っていない」の二つ重ね。
 */

test.describe('一人きりの放置', () => {
  let studentContext: BrowserContext;
  let teacherContext: BrowserContext;
  let studentPage: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('idle');
    teacherContext = await browser.newContext();
    studentContext = await browser.newContext();

    // 名簿づくりだけ先生側のブラウザで済ませる（先生は教室に入らない＝生徒が一人きりになる）
    const teacherPage = await teacherContext.newPage();
    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);

    studentPage = await studentContext.newPage();
    await studentPage.clock.install();
    await studentPage.goto('/');
    await clearAllData(studentPage);
    await studentPage.reload();
  });

  test.afterEach(async () => {
    await studentContext?.close();
    await teacherContext?.close();
    await teardownSupabaseRoster(classroomId);
  });

  test('一人きりで15分触らないと教室を出る／ボタン一つで戻れる', async () => {
    await loginAsStudent(studentPage, { studentCode: TEST_STUDENT_A.code, classroomId });

    // 14分では出ない（授業前に少し早く入っただけの生徒を追い出さない）
    await studentPage.clock.runFor(14 * 60 * 1000);
    await expect(studentPage.getByRole('heading', { name: '教室から出ました' })).toBeHidden();

    // 15分を越えると出る
    await studentPage.clock.runFor(2 * 60 * 1000);
    await expect(studentPage.getByRole('heading', { name: '教室から出ました' })).toBeVisible({ timeout: 15_000 });
    await expect(studentPage.getByText('こわれたのではありません')).toBeVisible();
    await studentPage.screenshot({ path: 'test-results/idle-exit-notice.png', fullPage: true });

    // ボタン一つで戻れる（ログインし直しにはならない）
    await studentPage.getByRole('button', { name: 'もう一度入る' }).click();
    await expect(studentPage.getByRole('heading', { name: '教室から出ました' })).toBeHidden({ timeout: 30_000 });
    await expect(studentPage.getByTestId('student-id-input')).toHaveCount(0);
  });

  test('触っていれば出ない', async () => {
    await loginAsStudent(studentPage, { studentCode: TEST_STUDENT_A.code, classroomId });

    // 期限の手前で一度触る → そこから数え直しになる
    await studentPage.clock.runFor(14 * 60 * 1000);
    await studentPage.mouse.click(5, 5);
    await studentPage.clock.runFor(5 * 60 * 1000);

    await expect(studentPage.getByRole('heading', { name: '教室から出ました' })).toBeHidden();
  });
});
