import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { TEST_STUDENT_A, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import {
  loginAsTeacher,
  openClassroomAndConnect,
  waitForStudentJoined,
  createGame,
  waitForTeacherGameWindow,
} from './helpers/teacher-actions';
import {
  loginAsStudent,
  enterAssignedGame,
  waitForMyTurn,
  playMove,
} from './helpers/student-actions';

/**
 * 生徒の再接続シナリオ。
 *
 * 注意: LiveKit の ParticipantDisconnected イベントが先生クライアントに届くタイミングが
 * 不安定（環境によっては StudentTable の data-connected 属性が更新されない事象を観測）なため、
 * ここでは「Header の N人接続中 カウントが正しく推移するか」をもって切断/再接続を検証する。
 * StudentTable の行属性追跡は別タスクで深掘り予定。
 */
test.describe('生徒再接続シナリオ', () => {
  test('対局中の生徒が離脱→新しいBrowserContextで再接続するとヘッダの接続数が復帰する', async ({ browser }) => {
    test.setTimeout(120_000);
    const classroomId = generateClassroomId('reconnect');
    const teacherContext = await browser.newContext();
    let studentContext: BrowserContext = await browser.newContext();
    const teacherPage = await teacherContext.newPage();
    let studentPage: Page = await studentContext.newPage();

    try {
      // === 先生セットアップ ===
      await teacherPage.goto('/');
      await clearAllData(teacherPage);
      await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
      await setupClassroomData(teacherPage, classroomId);
      await teacherPage.reload();

      // === 生徒A セットアップ ===
      await studentPage.goto('/');
      await clearAllData(studentPage);
      await setupClassroomData(studentPage, classroomId);
      await studentPage.reload();

      // === 先生ログイン & 教室接続 ===
      await loginAsTeacher(teacherPage);
      await openClassroomAndConnect(teacherPage);

      // === 生徒A ログイン ===
      await loginAsStudent(studentPage, {
        studentCode: TEST_STUDENT_A.code,
        classroomId,
      });

      // 先生側で生徒Aの接続を確認
      await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);
      // ヘッダに「1人接続中」
      await expect(teacherPage.getByText('1人接続中')).toBeVisible({ timeout: 10_000 });

      // === 対局作成: 生徒A(黒) vs 先生(白) ===
      // 先生自身が対局者なので講師専用の別ウィンドウが自動で開く。
      // 教室ホーム画面(teacherPage)は終始ダッシュボードのままなので、以降の検証に影響しない。
      const gameWindow = await waitForTeacherGameWindow(teacherPage, () =>
        createGame(teacherPage, {
          blackName: TEST_STUDENT_A.name,
          whiteName: '先生', // option表示は "teacher（先生）" なので「先生」でマッチ
          boardSize: 9,
          expectedPlayersCount: 2,
        }),
      );
      await gameWindow.close();

      // === 生徒が対局画面に入り、1手打つ ===
      await enterAssignedGame(studentPage);
      await waitForMyTurn(studentPage);
      await playMove(studentPage, 4, 4);
      await expect(studentPage.locator('[data-stone="4-4"]')).toBeVisible({ timeout: 10_000 });

      // === 生徒ブラウザを閉じて離脱 ===
      await closePageBestEffort(studentPage);
      await closeContextBestEffort(studentContext);

      // === 先生側: ヘッダが「0人接続中」に変わる（切断検知） ===
      await expect(teacherPage.getByText('0人接続中')).toBeVisible({ timeout: 30_000 });

      // === 新しいBrowserContextで再接続 ===
      studentContext = await browser.newContext();
      studentPage = await studentContext.newPage();
      await studentPage.goto('/');
      await clearAllData(studentPage);
      await setupClassroomData(studentPage, classroomId);
      await studentPage.reload();

      await loginAsStudent(studentPage, {
        studentCode: TEST_STUDENT_A.code,
        classroomId,
      });

      // === 先生側: 再度「1人接続中」（再接続検知） ===
      await expect(teacherPage.getByText('1人接続中')).toBeVisible({ timeout: 20_000 });
    } finally {
      await Promise.allSettled([
        closeContextBestEffort(teacherContext),
        closeContextBestEffort(studentContext),
      ]);
      if (classroomId) {
        await teardownSupabaseRoster(classroomId);
      }
    }
  });
});

async function closeContextBestEffort(context: BrowserContext): Promise<void> {
  await Promise.race([
    context.close(),
    new Promise<void>(resolve => setTimeout(resolve, 3_000)),
  ]);
}

async function closePageBestEffort(page: Page): Promise<void> {
  await Promise.race([
    page.close({ runBeforeUnload: false }),
    new Promise<void>(resolve => setTimeout(resolve, 3_000)),
  ]);
}
