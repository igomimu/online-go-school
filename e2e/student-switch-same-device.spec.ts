import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { TEST_STUDENT_A, TEST_STUDENT_B, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher, openClassroomAndConnect, waitForStudentJoined, createGame } from './helpers/teacher-actions';
import { loginAsStudent, enterAssignedGame } from './helpers/student-actions';

/**
 * 同じ端末で生徒を切り替える（2026-10-07 授業中）。
 * 金子さんで入ったあと切断して井町さんで入り直したら、碁盤が「観戦中」になって打てず、
 * 講師の映像には金子さんの名前が残った。本番と同じ RealtimeKit で確かめるときは
 * BASE_URL を RealtimeKit の開発サーバーに向ける。
 */
test.describe('同じ端末で生徒を切り替える', () => {
  let teacherContext: BrowserContext;
  let studentContext: BrowserContext;
  let teacherPage: Page;
  let studentPage: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('switch');
    teacherContext = await browser.newContext();
    studentContext = await browser.newContext();
    teacherPage = await teacherContext.newPage();
    studentPage = await studentContext.newPage();
    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.reload();
    await studentPage.goto('/');
    await clearAllData(studentPage);
    await studentPage.reload();
  });

  test.afterEach(async () => {
    await teacherContext?.close();
    await studentContext?.close();
    await teardownSupabaseRoster(classroomId);
  });

  test('Aで入って退室→Bで入り直すと、Bの対局を打てる', async () => {
    await loginAsTeacher(teacherPage, TEST_TEACHER_PASSWORD);
    await openClassroomAndConnect(teacherPage);
    await loginAsStudent(studentPage, { studentCode: TEST_STUDENT_A.code, classroomId });
    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);
    await studentPage.locator('header button', { hasText: 'カメラ' }).first().click();
    await expect(teacherPage.getByTestId('teacher-video-strip')).toContainText(TEST_STUDENT_A.name, { timeout: 20_000 });
    await studentPage.locator('button[title="切断"]').first().click();
    await studentPage.getByTestId('student-id-input').waitFor();
    await loginAsStudent(studentPage, { studentCode: TEST_STUDENT_B.code, classroomId });
    await waitForStudentJoined(teacherPage, TEST_STUDENT_B.id);
    await studentPage.locator('header button', { hasText: 'カメラ' }).first().click();
    // 講師画面の映像は B の名前で出て、前の A の枠は残らない
    const strip = teacherPage.getByTestId('teacher-video-strip');
    await expect(strip).toContainText(TEST_STUDENT_B.name, { timeout: 20_000 });
    await expect(strip).not.toContainText(TEST_STUDENT_A.name, { timeout: 10_000 });
    await createGame(teacherPage, { blackName: TEST_STUDENT_B.name, whiteName: '三村九段', boardSize: 9 });
    await enterAssignedGame(studentPage);
    await expect(studentPage.getByText('観戦中')).toHaveCount(0);
    await expect(studentPage.getByText('あなたの番です')).toBeVisible({ timeout: 10_000 });
  });
});
