import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { TEST_STUDENT_A, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher, openClassroomAndConnect, waitForStudentJoined } from './helpers/teacher-actions';
import { loginAsStudent } from './helpers/student-actions';

// 2026-08-05: 互先のニギリ。視覚効果は対局者のためのものなので、
// 先生が押すと対局者の画面にも同じ抽選が出る。
test.describe('ニギリ（黒白決め）', () => {
  let teacherContext: BrowserContext;
  let studentContext: BrowserContext;
  let teacherPage: Page;
  let studentPage: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('nigiri');
    teacherContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    studentContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    teacherPage = await teacherContext.newPage();
    studentPage = await studentContext.newPage();

    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.reload();

    await studentPage.goto('/');
    await clearAllData(studentPage);
    await setupClassroomData(studentPage, classroomId);
    await studentPage.reload();
  });

  test.afterEach(async () => {
    await teacherContext?.close();
    await studentContext?.close();
    if (classroomId) await teardownSupabaseRoster(classroomId);
  });

  test('互先でニギリを押すと黒番が決まり、対局者の画面にも同じ結果が出る', async () => {
    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);
    await loginAsStudent(studentPage, { studentCode: TEST_STUDENT_A.code, classroomId });
    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);

    await teacherPage.getByRole('button', { name: '対局作成', exact: true }).click();
    await expect(teacherPage.getByTestId('nigiri-button')).toBeVisible({ timeout: 10_000 });

    // 置石を選ぶとニギリは消える（互先のときだけの手続き）
    await teacherPage.getByTestId('handicap-3').click();
    await expect(teacherPage.getByTestId('nigiri-button')).toHaveCount(0);
    await teacherPage.getByTestId('handicap-even').click();
    await expect(teacherPage.getByTestId('nigiri-button')).toBeVisible();

    await teacherPage.getByTestId('nigiri-button').click();

    // 生徒の画面にも抽選が出て、黒番か白番かが伝わる
    await expect(studentPage.getByTestId('nigiri-announcement')).toBeVisible({ timeout: 10_000 });
    const studentResult = studentPage.getByTestId('nigiri-announcement-result');
    await expect(studentResult).toBeVisible({ timeout: 10_000 });
    const studentText = (await studentResult.textContent()) ?? '';
    expect(['あなたの黒番です', 'あなたは白番です']).toContain(studentText.trim());

    // 先生の画面の結果と食い違わない
    const teacherResult = (await teacherPage.getByTestId('nigiri-result').textContent()) ?? '';
    const studentIsBlack = studentText.includes('黒番');
    expect(teacherResult.includes(TEST_STUDENT_A.name)).toBe(studentIsBlack);

    // 決まった黒番が対局作成の黒番に入っている
    const blackValue = await teacherPage.getByTestId('black-player-select').inputValue();
    expect(blackValue.includes(TEST_STUDENT_A.id)).toBe(studentIsBlack);

    // 知らせは自分で消える
    await expect(studentPage.getByTestId('nigiri-announcement')).toHaveCount(0, { timeout: 15_000 });
  });
});
