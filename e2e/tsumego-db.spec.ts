import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { TEST_STUDENT_A, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupClassroomData, setupTeacherPassword, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher, openClassroomAndConnect, waitForStudentJoined } from './helpers/teacher-actions';
import { loginAsStudent, waitForConnectedCount } from './helpers/student-actions';

// 回帰テスト: SGFファイルの解答木が無く実質機能しなかった旧「詰碁」機能を、
// 詰碁データベース(tsumego_problems, sumatsume由来)からの配信に置き換えた(2026-07-22)。
// 配信〜生徒側表示〜着手フィードバックの疎通確認。実際の詰碁データは本番DBから
// ランダム取得するため、正誤判定の詳細ロジック自体はuseProblemSession.test.tsで別途検証している。

test('詰碁データベースから配信した問題が生徒側で解答可能になる', async ({ browser }) => {
  test.setTimeout(120_000);
  const classroomId = generateClassroomId('tsumegodb');
  const contexts: BrowserContext[] = [];
  const newPage = async (): Promise<Page> => {
    const ctx = await browser.newContext();
    contexts.push(ctx);
    return ctx.newPage();
  };

  const teacherPage = await newPage();
  const studentAPage = await newPage();

  try {
    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.reload();

    await studentAPage.goto('/');
    await clearAllData(studentAPage);
    await setupClassroomData(studentAPage, classroomId);
    await studentAPage.reload();

    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);
    await loginAsStudent(studentAPage, { studentCode: TEST_STUDENT_A.code, classroomId });
    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);
    await waitForConnectedCount(studentAPage, 1);

    // 先生: 詰碁DBダイアログを開く
    await teacherPage.getByRole('button', { name: '詰碁DB', exact: true }).click();
    await teacherPage.getByText('詰碁データベースから配信').waitFor({ timeout: 5_000 });

    // 9路で絞り込んでランダム取得(候補座標を絞りやすくするため)
    await teacherPage.getByRole('button', { name: '9路', exact: true }).click();
    await teacherPage.getByRole('button', { name: 'ランダムに1問取得' }).click();

    // プレビューの碁盤が表示されるまで待つ
    await teacherPage.getByTestId('go-board').waitFor({ timeout: 15_000 });

    // 配信
    await teacherPage.getByRole('button', { name: 'この問題を配信' }).click();

    // 先生側: 一緒に解く画面(ProblemBoard)ではなく、モニター画面(ProblemMonitorPanel)に
    // なっていることを確認。「配信終了」ボタンがあり、碁盤はreadOnly(data-cellが無い=クリック不可)。
    await teacherPage.getByRole('button', { name: '配信終了' }).waitFor({ timeout: 10_000 });
    await expect(teacherPage.getByTestId('go-board').locator('[data-cell]')).toHaveCount(0);
    // 生徒が結果を送るまでは「挑戦中」表示
    const teacherStudentRow = teacherPage.getByTestId('problem-monitor-row').filter({ hasText: 'テスト生徒A' });
    await teacherStudentRow.waitFor({ timeout: 10_000 });
    await expect(teacherStudentRow.getByTestId('problem-monitor-status')).toHaveText(/挑戦中/);

    // 生徒側: 詰碁画面(ProblemBoard)に切り替わる
    const studentBoard = studentAPage.getByTestId('go-board');
    await studentBoard.waitFor({ timeout: 15_000 });
    await studentAPage.getByText(/番です/).waitFor({ timeout: 5_000 });

    // 盤面のどこかをクリックしてフィードバック(正解/不正解)が出ることを確認。
    // 初期配置と被る可能性があるため複数座標を試す。
    const candidates: [number, number][] = [[1, 1], [9, 9], [1, 9], [9, 1], [5, 5]];
    let feedbackShown = false;
    for (const [x, y] of candidates) {
      await studentBoard.locator(`[data-cell="${x}-${y}"]`).click();
      feedbackShown = await studentAPage
        .getByText(/正解|不正解/)
        .isVisible()
        .catch(() => false);
      if (feedbackShown) break;
    }
    expect(feedbackShown).toBe(true);

    // 先生側: 生徒の解答結果(正解/不正解)がモニター一覧に反映される
    await expect(teacherStudentRow.getByTestId('problem-monitor-status')).toHaveText(/手|不正解/, { timeout: 10_000 });

    // 先生: 配信終了 → 生徒側も詰碁画面から抜ける(REVIEW_END連携)
    await teacherPage.getByRole('button', { name: '配信終了' }).click();
    await expect(studentAPage.getByTestId('go-board')).not.toBeVisible({ timeout: 10_000 });
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await teardownSupabaseRoster(classroomId);
  }
});

test('問題のまちがい報告ボタンでモーダルが開閉する', async ({ browser }) => {
  // 注意: tsumego_reportsへのINSERTは本番のDBトリガーがdojo@1kawa15.comへ実メール通知を
  // 発火する(dojo-appで運用実績あり)ため、このE2Eでは「報告する」を実際には押さない。
  // 送信処理自体の正しさはtsumegoApi.test.tsのunit testで検証済み。
  test.setTimeout(120_000);
  const classroomId = generateClassroomId('tsumegoreport');
  const contexts: BrowserContext[] = [];
  const newPage = async (): Promise<Page> => {
    const ctx = await browser.newContext();
    contexts.push(ctx);
    return ctx.newPage();
  };

  const teacherPage = await newPage();
  const studentAPage = await newPage();

  try {
    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.reload();

    await studentAPage.goto('/');
    await clearAllData(studentAPage);
    await setupClassroomData(studentAPage, classroomId);
    await studentAPage.reload();

    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);
    await loginAsStudent(studentAPage, { studentCode: TEST_STUDENT_A.code, classroomId });
    await waitForStudentJoined(teacherPage, TEST_STUDENT_A.id);
    await waitForConnectedCount(studentAPage, 1);

    await teacherPage.getByRole('button', { name: '詰碁DB', exact: true }).click();
    await teacherPage.getByText('詰碁データベースから配信').waitFor({ timeout: 5_000 });
    await teacherPage.getByRole('button', { name: 'ランダムに1問取得' }).click();
    await teacherPage.getByTestId('go-board').waitFor({ timeout: 15_000 });
    await teacherPage.getByRole('button', { name: 'この問題を配信' }).click();

    const studentBoard = studentAPage.getByTestId('go-board');
    await studentBoard.waitFor({ timeout: 15_000 });

    // 報告ボタン→モーダル表示→理由入力→キャンセルで閉じる（送信はしない）
    await studentAPage.getByRole('button', { name: 'この問題のまちがいを報告' }).click();
    await studentAPage.getByText('この問題を報告').waitFor({ timeout: 5_000 });
    await studentAPage.getByPlaceholder(/成立しない|表示範囲/).fill('E2Eテスト: 送信しません');
    await studentAPage.getByRole('button', { name: 'キャンセル' }).click();
    await expect(studentAPage.getByText('この問題を報告')).not.toBeVisible();
  } finally {
    for (const ctx of contexts) await ctx.close().catch(() => {});
    await teardownSupabaseRoster(classroomId);
  }
});
