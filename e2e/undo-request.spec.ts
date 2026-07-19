import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { TEST_STUDENT_A, TEST_STUDENT_B, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import {
  loginAsTeacher,
  openClassroomAndConnect,
  waitForStudentJoined,
  createGame,
  getOpenStudentButton,
  waitForObserverPanel,
} from './helpers/teacher-actions';
import {
  loginAsStudent,
  enterAssignedGame,
  waitForMyTurn,
  playMove,
} from './helpers/student-actions';

test.describe('「待った」機能（対局者どうしの同意制）', () => {
  let teacherContext: BrowserContext;
  let studentAContext: BrowserContext;
  let studentBContext: BrowserContext;
  let teacherPage: Page;
  let studentAPage: Page;
  let studentBPage: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('undo');
    teacherContext = await browser.newContext();
    studentAContext = await browser.newContext();
    studentBContext = await browser.newContext();
    teacherPage = await teacherContext.newPage();
    studentAPage = await studentAContext.newPage();
    studentBPage = await studentBContext.newPage();

    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.reload();

    await studentAPage.goto('/');
    await clearAllData(studentAPage);
    await setupClassroomData(studentAPage, classroomId);
    await studentAPage.reload();

    await studentBPage.goto('/');
    await clearAllData(studentBPage);
    await setupClassroomData(studentBPage, classroomId);
    await studentBPage.reload();
  });

  test.afterEach(async () => {
    await teacherContext?.close();
    await studentAContext?.close();
    await studentBContext?.close();
    if (classroomId) {
      await teardownSupabaseRoster(classroomId);
    }
  });

  test('申請→承諾で直前の一手が取り消され、盤面・手番が1手前に戻る', async () => {
    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);

    await Promise.all([
      loginAsStudent(studentAPage, { studentCode: TEST_STUDENT_A.code, classroomId }),
      loginAsStudent(studentBPage, { studentCode: TEST_STUDENT_B.code, classroomId }),
    ]);

    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);
    await waitForStudentJoined(teacherPage, TEST_STUDENT_B.id);

    await createGame(teacherPage, {
      blackName: TEST_STUDENT_A.name,
      whiteName: TEST_STUDENT_B.name,
      boardSize: 9,
      expectedPlayersCount: 3,
    });

    const openBtn = getOpenStudentButton(teacherPage, TEST_STUDENT_A.id);
    await expect(openBtn).toBeEnabled({ timeout: 10_000 });
    await openBtn.click();
    await waitForObserverPanel(teacherPage);

    await Promise.all([
      enterAssignedGame(studentAPage),
      enterAssignedGame(studentBPage),
    ]);

    // 生徒A(黒)が誤って(4,4)に着手してしまったと仮定
    await waitForMyTurn(studentAPage);
    await playMove(studentAPage, 4, 4);
    await expect(studentAPage.locator('[data-stone="4-4"]')).toBeVisible({ timeout: 10_000 });
    await expect(studentBPage.locator('[data-stone="4-4"]')).toBeVisible({ timeout: 10_000 });
    await expect(studentAPage.getByTestId('move-count')).toContainText('1手目');

    // 生徒A: 「待った」を申請（confirm自動承諾）
    studentAPage.on('dialog', (d) => d.accept());
    await studentAPage.getByRole('button', { name: /待った/ }).click();

    // 双方にバナーが表示される
    await expect(studentAPage.getByText('「待った」を申請中です')).toBeVisible({ timeout: 10_000 });
    await expect(studentBPage.getByText(/待った」を申請しています/)).toBeVisible({ timeout: 10_000 });

    // 申請中は着手不可（readOnly化によりセルのクリック要素自体が生成されない）
    await expect(studentBPage.locator('[data-cell="5-5"]')).toHaveCount(0);

    // 生徒B: 承諾する
    await studentBPage.getByRole('button', { name: '承諾する' }).click();

    // 盤面が0手目に戻り、石が消える。双方のバナーも消える。
    await expect(studentAPage.locator('[data-stone="4-4"]')).not.toBeVisible({ timeout: 10_000 });
    await expect(studentBPage.locator('[data-stone="4-4"]')).not.toBeVisible({ timeout: 10_000 });
    await expect(studentAPage.getByTestId('move-count')).toContainText('0手目');
    await expect(studentBPage.getByTestId('move-count')).toContainText('0手目');
    await expect(studentAPage.getByText('「待った」を申請中です')).not.toBeVisible();
    await expect(studentBPage.getByText(/待った」を申請しています/)).not.toBeVisible();

    // 手番が生徒A(黒)に戻っており、再度着手できる
    await waitForMyTurn(studentAPage);
  });

  test('拒否すると盤面は変わらず、双方とも再び着手できる', async () => {
    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);

    await Promise.all([
      loginAsStudent(studentAPage, { studentCode: TEST_STUDENT_A.code, classroomId }),
      loginAsStudent(studentBPage, { studentCode: TEST_STUDENT_B.code, classroomId }),
    ]);

    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);
    await waitForStudentJoined(teacherPage, TEST_STUDENT_B.id);

    await createGame(teacherPage, {
      blackName: TEST_STUDENT_A.name,
      whiteName: TEST_STUDENT_B.name,
      boardSize: 9,
      expectedPlayersCount: 3,
    });

    const openBtn = getOpenStudentButton(teacherPage, TEST_STUDENT_A.id);
    await expect(openBtn).toBeEnabled({ timeout: 10_000 });
    await openBtn.click();
    await waitForObserverPanel(teacherPage);

    await Promise.all([
      enterAssignedGame(studentAPage),
      enterAssignedGame(studentBPage),
    ]);

    await waitForMyTurn(studentAPage);
    await playMove(studentAPage, 3, 3);
    await expect(studentBPage.locator('[data-stone="3-3"]')).toBeVisible({ timeout: 10_000 });

    studentAPage.on('dialog', (d) => d.accept());
    await studentAPage.getByRole('button', { name: /待った/ }).click();
    await expect(studentBPage.getByText(/待った」を申請しています/)).toBeVisible({ timeout: 10_000 });

    await studentBPage.getByRole('button', { name: '拒否する' }).click();

    // 石は残ったまま、バナーは消える
    await expect(studentAPage.locator('[data-stone="3-3"]')).toBeVisible();
    await expect(studentBPage.locator('[data-stone="3-3"]')).toBeVisible();
    await expect(studentBPage.getByText(/待った」を申請しています/)).not.toBeVisible({ timeout: 10_000 });
    await expect(studentAPage.getByTestId('move-count')).toContainText('1手目');

    // 生徒B(白)の手番のまま着手できる
    await waitForMyTurn(studentBPage);
  });

  test('整地モード中は「待った」ボタンが表示されない', async () => {
    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);

    await Promise.all([
      loginAsStudent(studentAPage, { studentCode: TEST_STUDENT_A.code, classroomId }),
      loginAsStudent(studentBPage, { studentCode: TEST_STUDENT_B.code, classroomId }),
    ]);

    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);
    await waitForStudentJoined(teacherPage, TEST_STUDENT_B.id);

    await createGame(teacherPage, {
      blackName: TEST_STUDENT_A.name,
      whiteName: TEST_STUDENT_B.name,
      boardSize: 9,
      expectedPlayersCount: 3,
    });

    const openBtn = getOpenStudentButton(teacherPage, TEST_STUDENT_A.id);
    await expect(openBtn).toBeEnabled({ timeout: 10_000 });
    await openBtn.click();
    await waitForObserverPanel(teacherPage);

    await Promise.all([
      enterAssignedGame(studentAPage),
      enterAssignedGame(studentBPage),
    ]);

    // 両者即パスして整地モードへ
    await waitForMyTurn(studentAPage);
    await studentAPage.getByRole('button', { name: /パス/ }).click();
    await waitForMyTurn(studentBPage);
    await studentBPage.getByRole('button', { name: /パス/ }).click();

    await expect(studentAPage.getByTestId('move-count')).toContainText('整地中', { timeout: 10_000 });
    await expect(studentAPage.getByRole('button', { name: /待った/ })).not.toBeVisible();
    await expect(studentBPage.getByRole('button', { name: /待った/ })).not.toBeVisible();
  });
});
