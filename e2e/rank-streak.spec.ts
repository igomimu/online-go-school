import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { TEST_STUDENT_A, TEST_STUDENT_B, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, serviceClient, setupClassroomData, setupTeacherPassword, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher, openClassroomAndConnect, waitForStudentJoined } from './helpers/teacher-actions';
import { loginAsStudent } from './helpers/student-actions';

// 2026-09-26 三村さん: 道場ランクは3連勝で1つ上、3連敗で1つ下。終局したら自動で変え、
// 講師にも本人にも知らせる。判定はDBのトリガーなので、ここでは終局をDBに直接書いて、
// 画面に知らせが届き、名簿のランクが変わるところまでを確かめる。
test('3連勝した生徒のランクが上がり、講師と本人の両方に知らせが出る', async ({ browser }) => {
  test.setTimeout(120_000);
  const classroomId = generateClassroomId('rank');
  const contexts: BrowserContext[] = [];
  const newPage = async (): Promise<Page> => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    contexts.push(ctx);
    return ctx.newPage();
  };

  try {
    const teacherPage = await newPage();
    const studentAPage = await newPage();
    const studentBPage = await newPage();

    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.reload();
    for (const page of [studentAPage, studentBPage]) {
      await page.goto('/');
      await clearAllData(page);
      await setupClassroomData(page, classroomId);
      await page.reload();
    }

    const db = serviceClient();
    const { error: ratingError } = await db
      .from('go_school_students')
      .update({ internal_rating: 'R12' })
      .in('login_id', [TEST_STUDENT_A.code, TEST_STUDENT_B.code]);
    expect(ratingError).toBeNull();

    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);
    await loginAsStudent(studentAPage, { studentCode: TEST_STUDENT_A.code, classroomId });
    await loginAsStudent(studentBPage, { studentCode: TEST_STUDENT_B.code, classroomId });
    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);
    await waitForStudentJoined(teacherPage, TEST_STUDENT_B.id);
    // 購読が張られるのを待つ
    await teacherPage.waitForTimeout(2_000);

    // Aが黒で3局続けて勝つ（投了・時間切れ・目数、どの終わり方でも数える）
    for (const result of ['B+R', 'B+T', 'B+3.5']) {
      const { data: game, error } = await db
        .from('go_school_live_games')
        .insert({
          classroom_id: classroomId,
          black_player: `sid:${TEST_STUDENT_A.code}`,
          white_player: `sid:${TEST_STUDENT_B.code}`,
          board_size: 19,
          status: 'playing',
          // 明示しないと「ランクに入れない」になる（既定値）
          rating_excluded: false,
        })
        .select('id')
        .single();
      expect(error).toBeNull();
      const { error: finishError } = await db
        .from('go_school_live_games')
        .update({ status: 'finished', result })
        .eq('id', (game as { id: string }).id);
      expect(finishError).toBeNull();
    }

    const { data: rows } = await db
      .from('go_school_students')
      .select('login_id, internal_rating')
      .in('login_id', [TEST_STUDENT_A.code, TEST_STUDENT_B.code]);
    const ratings = Object.fromEntries((rows as { login_id: string; internal_rating: string }[]).map(r => [r.login_id, r.internal_rating]));
    expect(ratings[TEST_STUDENT_A.code]).toBe('R11');
    expect(ratings[TEST_STUDENT_B.code]).toBe('R13');

    const teacherAlerts = teacherPage.getByTestId('classroom-alert-rank');
    await expect(teacherAlerts.filter({ hasText: 'R12→R11' })).toBeVisible({ timeout: 15_000 });
    await expect(teacherAlerts.filter({ hasText: 'R12→R13' })).toBeVisible({ timeout: 15_000 });
    await expect(studentAPage.getByTestId('rank-notice')).toContainText('R11 に上がりました', { timeout: 15_000 });
    await expect(studentBPage.getByTestId('rank-notice')).toContainText('R13 に下がりました', { timeout: 15_000 });
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    // 試験生徒のランクは空に戻す（他の試験は段級で動く）
    await serviceClient()
      .from('go_school_students')
      .update({ internal_rating: '' })
      .in('login_id', [TEST_STUDENT_A.code, TEST_STUDENT_B.code])
      .then(() => {}, () => {});
    await teardownSupabaseRoster(classroomId);
  }
});
