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

  // 2026-08-04 三村さん指摘: 申請中は双方とも打てないのに秒読みだけ進んでいた。
  // 返答を待っている側が切れ負けしかねないので、申請中は計時を止める。
  test('申請中は時計が止まり、解決後に再開する', async () => {
    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);

    await Promise.all([
      loginAsStudent(studentAPage, { studentCode: TEST_STUDENT_A.code, classroomId }),
      loginAsStudent(studentBPage, { studentCode: TEST_STUDENT_B.code, classroomId }),
    ]);
    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);
    await waitForStudentJoined(teacherPage, TEST_STUDENT_B.id);

    // 秒読みだけだと1回きりで切れてしまうので、持ち時間を与えて減り方を観測する
    await createGame(teacherPage, {
      blackName: TEST_STUDENT_A.name,
      whiteName: TEST_STUDENT_B.name,
      boardSize: 9,
      expectedPlayersCount: 3,
      mainMinutes: 5,
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
    await playMove(studentAPage, 4, 4);
    await waitForMyTurn(studentBPage);

    // 白(B)の手番で黒(A)が待ったを申請 → 動いているのは白の時計
    studentAPage.on('dialog', (d) => d.accept());
    await studentAPage.getByRole('button', { name: /待った/ }).click();
    await expect(studentBPage.getByText(/待った」を申請しています/)).toBeVisible({ timeout: 10_000 });

    const whiteClock = studentBPage.getByTestId('clock-white');
    await studentBPage.waitForTimeout(1200); // バナー表示直後の1tickぶんを見送る
    const frozen = await whiteClock.textContent();
    await studentBPage.waitForTimeout(4000);
    expect(await whiteClock.textContent()).toBe(frozen);

    // 拒否して再開 → 再び減り始める
    await studentBPage.getByRole('button', { name: '拒否する' }).click();
    await expect(studentBPage.getByText(/待った」を申請しています/)).not.toBeVisible({ timeout: 10_000 });
    await expect
      .poll(async () => await whiteClock.textContent(), { timeout: 10_000 })
      .not.toBe(frozen);
  });

  // 2026-08-02 三村さん指定: 黒が置き間違えて白が打ち返した後に待った→承諾なら、
  // 白の応手と黒の誤着の2手をまとめて戻し、黒の手番に戻す。
  test('相手が打ち返した後に申請→承諾で2手戻り、申請者の手番に戻る', async () => {
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

    // 黒(A)が誤着 → 白(B)が打ち返す
    await waitForMyTurn(studentAPage);
    await playMove(studentAPage, 4, 4);
    await waitForMyTurn(studentBPage);
    await playMove(studentBPage, 6, 6);
    await expect(studentAPage.getByTestId('move-count')).toContainText('2手目', { timeout: 10_000 });

    // 黒(A)が「待った」を申請 → 白(B)が承諾
    studentAPage.on('dialog', (d) => d.accept());
    await studentAPage.getByRole('button', { name: /待った/ }).click();
    await expect(studentBPage.getByText(/待った」を申請しています/)).toBeVisible({ timeout: 10_000 });
    await studentBPage.getByRole('button', { name: '承諾する' }).click();

    // 白の応手と黒の誤着が両方消えて0手目、手番は黒(A)に戻る
    await expect(studentAPage.getByTestId('move-count')).toContainText('0手目', { timeout: 10_000 });
    await expect(studentBPage.getByTestId('move-count')).toContainText('0手目', { timeout: 10_000 });
    await expect(studentAPage.locator('[data-stone="4-4"]')).not.toBeVisible();
    await expect(studentAPage.locator('[data-stone="6-6"]')).not.toBeVisible();
    await expect(studentBPage.locator('[data-stone="6-6"]')).not.toBeVisible();
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
