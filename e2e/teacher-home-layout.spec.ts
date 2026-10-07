import { test, expect, chromium, type Page, type Browser, type BrowserContext } from '@playwright/test';
import { TEST_STUDENT_A, TEST_STUDENT_B, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher, openClassroomAndConnect, waitForStudentJoined } from './helpers/teacher-actions';
import { loginAsStudent } from './helpers/student-actions';

/**
 * 講師ホームで映像列・生徒一覧を広げても、碁盤欄と映像が隠れないこと。
 *
 * 2026-10-07 三村さん報告:
 *   - 映像を広げると、横にあふれた映像のスクロールバーが生徒一覧の下に隠れ、右の映像へ行けなかった
 *   - 碁盤欄が高さ0に潰れ、下へずらして見ることもできなかった
 * Windows と同じくスクロールバーに幅を取らせて確かめる（Playwright の既定は隠す）。
 */

const BASE = process.env.BASE_URL || 'http://localhost:5175';

test.describe('講師ホームの縦配分', () => {
  let browser: Browser;
  let teacherContext: BrowserContext;
  const studentContexts: BrowserContext[] = [];
  let teacherPage: Page;
  let classroomId: string;

  test.beforeEach(async () => {
    browser = await chromium.launch({
      ignoreDefaultArgs: ['--hide-scrollbars'],
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    });
    classroomId = generateClassroomId('layout');
    teacherContext = await browser.newContext({ viewport: { width: 1366, height: 768 }, baseURL: BASE });
    teacherPage = await teacherContext.newPage();
    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.reload();
  });

  test.afterEach(async () => {
    await browser?.close();
    studentContexts.length = 0;
    await teardownSupabaseRoster(classroomId);
  });

  async function joinWithCamera(student: typeof TEST_STUDENT_A) {
    const ctx = await browser.newContext({ baseURL: BASE });
    studentContexts.push(ctx);
    const page = await ctx.newPage();
    await page.goto('/');
    await clearAllData(page);
    await page.reload();
    await loginAsStudent(page, { studentCode: student.code, classroomId });
    await waitForStudentJoined(teacherPage, student.id);
    await page.locator('header button', { hasText: 'カメラ' }).first().click();
  }

  async function drag(label: string, dy: number) {
    const box = await teacherPage.getByTestId(`resizer-${label}`).boundingBox();
    await teacherPage.mouse.move(box!.x + 50, box!.y + box!.height / 2);
    await teacherPage.mouse.down();
    await teacherPage.mouse.move(box!.x + 50, box!.y + box!.height / 2 + dy, { steps: 5 });
    await teacherPage.mouse.up();
  }

  test('映像と生徒一覧を広げても、横スクロールバーと碁盤欄が見える', async () => {
    await loginAsTeacher(teacherPage, TEST_TEACHER_PASSWORD);
    await openClassroomAndConnect(teacherPage);
    await joinWithCamera(TEST_STUDENT_A);
    await joinWithCamera(TEST_STUDENT_B);
    // 先生のカメラも点けて3枚にし、映像を広げたときに横へあふれさせる
    await teacherPage.locator('button[title="カメラON"]').first().click();
    const strip = teacherPage.getByTestId('teacher-video-strip');
    await expect(strip.locator('.aspect-video')).toHaveCount(3, { timeout: 20_000 });

    await drag('参加者映像の高さ', 300);
    await drag('生徒一覧の高さ', 200);

    // 映像の行（横スクロールバー込み）が映像列の枠に収まっている
    const fit = await strip.evaluate(el => {
      const row = el.querySelector('[aria-label="参加者映像"]') as HTMLElement;
      return {
        overflowsX: row.scrollWidth > row.clientWidth,
        rowBottom: row.getBoundingClientRect().bottom,
        stripBottom: el.getBoundingClientRect().bottom,
      };
    });
    expect(fit.overflowsX, '映像が横にあふれる状況を作れていない').toBe(true);
    expect(fit.rowBottom, '映像の横スクロールバーが映像列の外にはみ出している').toBeLessThanOrEqual(fit.stripBottom + 1);

    // 碁盤欄は潰れず、スクロールすれば画面内に出てくる
    const main = teacherPage.getByTestId('teacher-home-main');
    expect((await main.boundingBox())!.height, '碁盤欄が潰れている').toBeGreaterThanOrEqual(240);
    await teacherPage.getByTestId('teacher-home-scroll').evaluate(el => { el.scrollTop = el.scrollHeight; });
    await expect(main).toBeInViewport({ ratio: 0.9 });
    // ツールバーは常に最下部に残る
    await expect(teacherPage.getByRole('button', { name: '対局作成', exact: true })).toBeInViewport();
    await teacherPage.screenshot({ path: 'test-results/teacher-home-layout-scrolled.png' });
  });
});
