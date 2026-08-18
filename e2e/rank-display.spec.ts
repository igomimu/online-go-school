import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { TEST_STUDENT_A, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import {
  loginAsTeacher,
  openClassroomAndConnect,
  waitForStudentJoined,
} from './helpers/teacher-actions';
import { loginAsStudent } from './helpers/student-actions';

/**
 * 棋力の見せ方は教室ごとに選ぶ（2026-08-13 三村さん）。
 *   段級 … 一般の大人向け。「初段」「3級」
 *   ランク … 道場の生徒向け。「R12」（0が最強）
 */
test.describe('棋力の表示方法', () => {
  let teacherContext: BrowserContext;
  let studentContext: BrowserContext;
  let teacherPage: Page;
  let studentPage: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('rank');
    teacherContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
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
    // 先生が教室を開くまで生徒は入れないので、先生を先に入れる
    await loginAsTeacher(teacherPage, TEST_TEACHER_PASSWORD);
    await openClassroomAndConnect(teacherPage);

    await loginAsStudent(studentPage, { studentCode: TEST_STUDENT_A.code, classroomId });
    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);
  });

  test.afterEach(async () => {
    await teacherContext?.close();
    await studentContext?.close();
    await teardownSupabaseRoster(classroomId);
  });

  test('教室設定で段級とランクを切り替えられる', async () => {
    // 生徒の棋力を段級=初段 / ランク=R12 にする
    await teacherPage.getByRole('button', { name: '編集', exact: true }).first().click();
    await teacherPage.getByTestId('student-rank-select').selectOption('初段');
    await teacherPage.getByTestId('student-rating-select').selectOption('R12');
    await teacherPage.getByRole('button', { name: '保存', exact: true }).click();
    await expect(teacherPage.getByTestId('student-rank-select')).toHaveCount(0, { timeout: 10_000 });

    // 既定は段級なので「初段」が出る
    const rankCell = teacherPage.getByTestId('student-rank-cell').first();
    await expect(rankCell).toHaveText('初段', { timeout: 10_000 });

    // 授業中のタイトル行から「ランク」に変えると、その場で一覧へ反映される
    await teacherPage.getByTestId('rank-display-rating').click();
    await expect(teacherPage.getByTestId('rank-display-rating')).toHaveAttribute('aria-pressed', 'true');
    await expect(rankCell).toHaveText('R12', { timeout: 10_000 });

    // 「段級」に戻す操作も授業画面内だけで完結する
    await teacherPage.getByTestId('rank-display-dan_kyu').click();
    await expect(rankCell).toHaveText('初段', { timeout: 10_000 });

    // テスト終了時の保存値をランクへ戻して、画面配置も記録する
    await teacherPage.getByTestId('rank-display-rating').click();
    await expect(rankCell).toHaveText('R12', { timeout: 10_000 });
    await teacherPage.screenshot({ path: 'test-results/rank-display-rating.png' });
  });
  test('講師がランクへ切り替えると、生徒の参加者一覧もランクになる', async () => {
    // 生徒の棋力を段級=初段 / ランク=R12 にする
    await teacherPage.getByRole('button', { name: '編集', exact: true }).first().click();
    await teacherPage.getByTestId('student-rank-select').selectOption('初段');
    await teacherPage.getByTestId('student-rating-select').selectOption('R12');
    await teacherPage.getByRole('button', { name: '保存', exact: true }).click();
    await expect(teacherPage.getByTestId('student-rank-select')).toHaveCount(0, { timeout: 10_000 });

    // 生徒の端末にも名簿を持たせる（本番では講師機と共有PCのキャッシュから来る）
    await studentPage.evaluate(({ id, name }) => {
      localStorage.setItem('go-school-students', JSON.stringify([
        { id, name, rank: '初段', internalRating: 'R12', type: 'ネット生', grade: '', country: '' },
      ]));
    }, { id: TEST_STUDENT_A.id, name: TEST_STUDENT_A.name });
    await studentPage.reload();
    await expect(studentPage.getByTestId('participant-rank').first())
      .toHaveText('初段', { timeout: 20_000 });

    // 講師が「ランク」に切り替えると、生徒の画面も追従する
    await teacherPage.getByTestId('rank-display-rating').click();
    await expect(studentPage.getByTestId('participant-rank').first())
      .toHaveText('R12', { timeout: 20_000 });

    // 「段級」に戻せば生徒も戻る
    await teacherPage.getByTestId('rank-display-dan_kyu').click();
    await expect(studentPage.getByTestId('participant-rank').first())
      .toHaveText('初段', { timeout: 20_000 });
  });
  test('生徒の端末に名簿が無くても、自分の教室の棋力は出る', async () => {
    // 生徒の棋力を段級=初段 / ランク=R12 にする
    await teacherPage.getByRole('button', { name: '編集', exact: true }).first().click();
    await teacherPage.getByTestId('student-rank-select').selectOption('初段');
    await teacherPage.getByTestId('student-rating-select').selectOption('R12');
    await teacherPage.getByRole('button', { name: '保存', exact: true }).click();
    await expect(teacherPage.getByTestId('student-rank-select')).toHaveCount(0, { timeout: 10_000 });

    // 生徒の端末から名簿のキャッシュを消す（講師機を使ったことのない実際の生徒と同じ状態）
    await studentPage.evaluate(() => {
      localStorage.removeItem('go-school-students');
      localStorage.removeItem('go-school-classrooms');
    });
    await studentPage.reload();

    // Edge Function から自分の教室ぶんを取り、棋力が出る
    await expect(studentPage.getByTestId('participant-rank').first())
      .toHaveText('初段', { timeout: 20_000 });
  });
});
