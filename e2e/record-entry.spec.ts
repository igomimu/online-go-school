import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { TEST_STUDENT_A, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import {
  clearAllData,
  deleteBroughtGames,
  setupTeacherPassword,
  setupClassroomData,
  teardownSupabaseRoster,
} from './helpers/setup';
import { loginAsStudent } from './helpers/student-actions';
import { clickToolbarMenuItem, loginAsTeacher, openClassroomAndConnect } from './helpers/teacher-actions';

/**
 * 棋譜作成（2026-09-07 三村さん「棋譜をアップロードする機能と、アプリ内に棋譜を
 * 入力して保存する機能」）。
 *
 * 1. 生徒が空の盤に自分の碁を入力して保存し、棋譜履歴に出ること
 * 2. SGFファイルを読むと、対局者・日付・結果が保存の窓の初期値に入ること
 *
 * 🔴 保存先は本番の go_school_games。作った行は afterEach で必ず消す。
 */

const STUDENT_IDENTITY = `sid:${TEST_STUDENT_A.id}`;

test.describe('棋譜作成', () => {
  let teacherContext: BrowserContext;
  let studentContext: BrowserContext;
  let teacherPage: Page;
  let studentPage: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('record');
    teacherContext = await browser.newContext();
    studentContext = await browser.newContext();
    teacherPage = await teacherContext.newPage();
    studentPage = await studentContext.newPage();

    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.reload();
    // 先生が教室を開くまで生徒は入れない
    await loginAsTeacher(teacherPage, TEST_TEACHER_PASSWORD);
    await openClassroomAndConnect(teacherPage);
    await loginAsStudent(studentPage, { studentCode: TEST_STUDENT_A.code, classroomId });
  });

  test.afterEach(async () => {
    await deleteBroughtGames(STUDENT_IDENTITY);
    await deleteBroughtGames('teacher');
    await studentContext?.close();
    await teacherContext?.close();
    if (classroomId) await teardownSupabaseRoster(classroomId);
  });

  test('生徒が空の盤に入力した棋譜を保存すると、棋譜履歴に出る', async () => {
    await studentPage.getByTestId('open-record-create').click();
    await expect(studentPage.getByTestId('record-start-dialog')).toBeVisible();

    await studentPage.getByTestId('record-size-9').click();
    await studentPage.getByTestId('record-start-empty').click();

    // 「棋譜作成」はホームのボタンにも入口の窓にもあるので、盤の目印で待つ
    await expect(studentPage.getByTestId('save-record-button')).toBeVisible({ timeout: 10_000 });
    await expect(studentPage.getByText('0手目')).toBeVisible();

    // 黒→白→黒 と交互に並ぶ（色は直前の手から自動で決まる）
    const board = studentPage.getByTestId('go-board');
    await board.locator('[data-cell="4-4"]').click();
    await board.locator('[data-cell="3-3"]').click();
    await board.locator('[data-cell="6-6"]').click();
    await expect(studentPage.getByText('3手目')).toBeVisible({ timeout: 5_000 });

    await studentPage.getByTestId('save-record-button').click();
    await expect(studentPage.getByTestId('record-save-dialog')).toBeVisible();
    await studentPage.getByTestId('record-opponent-name').fill('E2Eの相手');
    await studentPage.getByTestId('record-result').fill('黒中押し勝ち');

    studentPage.once('dialog', d => void d.accept()); // 「棋譜を保存しました」
    await studentPage.getByTestId('record-save-submit').click();

    // ホームへ戻り、自分の棋譜履歴に並ぶ
    await expect(studentPage.getByRole('heading', { name: '自分の棋譜履歴' })).toBeVisible({ timeout: 15_000 });
    await expect(studentPage.getByText('E2Eの相手')).toBeVisible({ timeout: 15_000 });
  });

  test('先生は教材メニューから棋譜作成を開き、名簿の生徒の棋譜として保存できる', async () => {
    await clickToolbarMenuItem(teacherPage, '教材', '棋譜作成');
    await expect(teacherPage.getByTestId('record-start-dialog')).toBeVisible();

    await teacherPage.getByTestId('record-size-9').click();
    await teacherPage.getByTestId('record-start-empty').click();
    await expect(teacherPage.getByTestId('save-record-button')).toBeVisible({ timeout: 10_000 });

    const board = teacherPage.getByTestId('go-board');
    await board.locator('[data-cell="4-4"]').click();
    await board.locator('[data-cell="3-3"]').click();
    await expect(teacherPage.getByText('2手目')).toBeVisible({ timeout: 5_000 });

    await teacherPage.getByTestId('save-record-button').click();
    await teacherPage.getByTestId('record-black-select').selectOption(`sid:${TEST_STUDENT_A.id}`);
    await teacherPage.getByTestId('record-white-name').fill('三村九段');

    teacherPage.once('dialog', d => void d.accept());
    await teacherPage.getByTestId('record-save-submit').click();

    // 保存できたらホームへ戻る（失敗したときは窓に理由が残る）
    await expect(teacherPage.getByTestId('record-save-dialog')).toBeHidden({ timeout: 15_000 });
    await expect(teacherPage.getByText(/三村囲碁オンライン.*〜/)).toBeVisible({ timeout: 10_000 });
  });

  test('SGFファイルを読むと、対局者と結果が保存の窓に入っている', async () => {
    await studentPage.getByTestId('open-record-create').click();

    const fileChooserPromise = studentPage.waitForEvent('filechooser');
    await studentPage.getByTestId('record-open-sgf').click();
    const chooser = await fileChooserPromise;
    await chooser.setFiles({
      name: 'brought.sgf',
      mimeType: 'application/x-go-sgf',
      buffer: Buffer.from(
        '(;FF[4]GM[1]SZ[9]PB[テスト生徒A]PW[幽玄の相手]DT[2026-08-30]RE[黒中押し勝ち]KM[6.5];B[ee];W[cc])',
        'utf-8',
      ),
    });

    await expect(studentPage.getByTestId('save-record-button')).toBeVisible({ timeout: 10_000 });
    // 読み込んだ棋譜は最終手から始まる（続きを入力できるように）
    await expect(studentPage.getByText('2手目')).toBeVisible({ timeout: 10_000 });

    await studentPage.getByTestId('save-record-button').click();
    await expect(studentPage.getByTestId('record-date')).toHaveValue('2026-08-30');
    await expect(studentPage.getByTestId('record-result')).toHaveValue('黒中押し勝ち');
    // 生徒の窓では相手の名前だけを引き継ぐ（自分側は identity で保存するため選ばせない）
    await expect(studentPage.getByTestId('record-opponent-name')).toHaveValue('幽玄の相手');
  });
});
