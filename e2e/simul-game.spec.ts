import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { TEST_STUDENT_A, TEST_STUDENT_B, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupClassroomData, setupTeacherPassword, teardownSupabaseRoster } from './helpers/setup';
import { createGame, loginAsTeacher, openClassroomAndConnect, waitForStudentJoined } from './helpers/teacher-actions';
import { enterAssignedGame, loginAsStudent, playMove, waitForMyTurn } from './helpers/student-actions';

function simulTile(page: Page, studentName: string) {
  return page.getByRole('button', { name: new RegExp(`${studentName}.*\\d+手目`) });
}

test.describe('多面打ちv2: 単一盤ローテーション', () => {
  let teacherContext: BrowserContext;
  let studentAContext: BrowserContext;
  let studentBContext: BrowserContext;
  let teacherPage: Page;
  let studentAPage: Page;
  let studentBPage: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('simul');
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
    if (classroomId) await teardownSupabaseRoster(classroomId);
  });

  test('通常の対局作成を重ねるだけで多面打ちビュー（1盤表示）になり、講師着手後に自動切り替えが行われる', async () => {
    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);

    await Promise.all([
      loginAsStudent(studentAPage, { studentCode: TEST_STUDENT_A.code, classroomId }),
      loginAsStudent(studentBPage, { studentCode: TEST_STUDENT_B.code, classroomId }),
    ]);
    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);
    await waitForStudentJoined(teacherPage, TEST_STUDENT_B.id);

    // 1. 通常の「対局作成」で A(黒) vs 先生(白) -> 多面打ちビュー（1盤表示）が自動で開く
    await createGame(teacherPage, {
      blackName: TEST_STUDENT_A.name,
      whiteName: '先生',
      boardSize: 9,
      expectedPlayersCount: 3, // 先生 + 生徒2
    });

    // -> 全画面盤ではなく多面打ちビューの盤が1面表示される（Aの盤。まだ黒番=A考慮中）
    const activeBoard = teacherPage.getByTestId('simul-active-board');
    await expect(activeBoard).toBeVisible({ timeout: 10_000 });
    await expect(activeBoard.getByText(TEST_STUDENT_A.name)).toBeVisible();
    await expect(activeBoard.getByText('相手の番です')).toBeVisible(); // 黒考慮中
    await expect(teacherPage.getByRole('button', { name: '閉じてホーム' })).toHaveCount(0); // 全画面盤に閉じ込めない

    // 2. さらに「対局作成」で B(黒) vs 先生(白) -> 対局作成ボタンは多面打ちビュー中も操作できる
    await createGame(teacherPage, {
      blackName: TEST_STUDENT_B.name,
      whiteName: '先生',
      boardSize: 9,
      expectedPlayersCount: 3,
    });

    // -> 表示は1盤のまま（Aの盤）、上部バーが「2面（あなたの番 0面）」になる
    await expect(activeBoard).toBeVisible();
    await expect(activeBoard.getByText(TEST_STUDENT_A.name)).toBeVisible();
    await expect(teacherPage.getByText('2面（あなたの番 0面）')).toBeVisible({ timeout: 10_000 });

    // 生徒A・Bが対局に入る
    await Promise.all([
      enterAssignedGame(studentAPage),
      enterAssignedGame(studentBPage),
    ]);

    // 3. Aが初手
    await waitForMyTurn(studentAPage);
    await playMove(studentAPage, 4, 4);
    await expect(studentAPage.locator('[data-stone="4-4"]')).toBeVisible({ timeout: 10_000 });

    // 先生の盤が「あなたの番です」に更新される（A盤表示のまま）
    await expect(activeBoard.getByText('あなたの番です')).toBeVisible({ timeout: 10_000 });
    await expect(activeBoard.locator('[data-stone="4-4"]')).toBeVisible();
    await expect(activeBoard.getByText(TEST_STUDENT_A.name)).toBeVisible();

    // 4. Bが初手
    await waitForMyTurn(studentBPage);
    await playMove(studentBPage, 3, 3);
    await expect(studentBPage.locator('[data-stone="3-3"]')).toBeVisible({ timeout: 10_000 });

    // 先生が着手（A盤の 5, 5） -> 自動でBの盤に切り替わる
    await playMove(teacherPage, 5, 5); // 先生がA盤に着手

    // 自動でB盤に切り替わる（B名表示、B初手の3-3あり、先生の手番）
    await expect(activeBoard.getByText(TEST_STUDENT_B.name)).toBeVisible({ timeout: 10_000 });
    await expect(activeBoard.locator('[data-stone="3-3"]')).toBeVisible();
    await expect(activeBoard.getByText('あなたの番です')).toBeVisible();

    // 5. 先生がB盤で着手 -> 両盤とも相手考慮中 -> 表示は現在の盤（B盤）に留まる
    await playMove(teacherPage, 6, 6); // 先生がB盤に着手

    // 相手考慮中になり、B盤のまま留まる（上部バー「2面（あなたの番 0面）」）
    await expect(activeBoard.getByText(TEST_STUDENT_B.name)).toBeVisible();
    await expect(activeBoard.getByText('相手の番です')).toBeVisible({ timeout: 10_000 });
    await expect(teacherPage.getByText('2面（あなたの番 0面）')).toBeVisible();

    // 6. Aが2手目 -> 自動でA盤へ切替
    await waitForMyTurn(studentAPage);
    await playMove(studentAPage, 2, 2);
    await expect(studentAPage.locator('[data-stone="2-2"]')).toBeVisible({ timeout: 10_000 });

    // 自動でA盤へ切り替わる
    await expect(activeBoard.getByText(TEST_STUDENT_A.name)).toBeVisible({ timeout: 10_000 });
    await expect(activeBoard.locator('[data-stone="2-2"]')).toBeVisible();
    await expect(activeBoard.getByText('あなたの番です')).toBeVisible();

    // 7. 「一覧」トグル -> タイル2面表示 -> Bのタイルをクリック -> B盤の単一表示に戻る
    await teacherPage.getByRole('button', { name: '一覧', exact: true }).click();

    // タイルが表示される
    const tileB = simulTile(teacherPage, TEST_STUDENT_B.name);
    await expect(tileB).toBeVisible({ timeout: 10_000 });
    await tileB.click();

    // B盤の単一表示に戻る
    await expect(activeBoard).toBeVisible({ timeout: 10_000 });
    await expect(activeBoard.getByText(TEST_STUDENT_B.name)).toBeVisible();

    // 8. この間、生徒A/Bの盤が勝手に閉じたりリロードされたりしないこと
    await expect(studentAPage.getByTestId('go-board')).toBeVisible();
    await expect(studentBPage.getByTestId('go-board')).toBeVisible();
  });
});
