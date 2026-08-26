import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { TEST_STUDENT_A, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsTeacher, openClassroomAndConnect, loadSgfForReview } from './helpers/teacher-actions';
import { loginAsStudent } from './helpers/student-actions';

/** 30手ぶんの棋譜。棋譜履歴から検討を開くときと同じく、手が入った状態から始める */
const SGF_30 = '(;FF[4]GM[1]SZ[19]'
  + ';B[dd];W[pp];B[dp];W[pd];B[cf];W[fq];B[dr];W[cn];B[dn];W[dm]'
  + ';B[en];W[co];B[cp];W[cm];B[fp];W[gq];B[gp];W[hq];B[hp];W[iq]'
  + ';B[ip];W[jq];B[jp];W[kq];B[kp];W[lq];B[lp];W[mq];B[mp];W[nq]'
  + ')';

/**
 * 矢印キーで手順を早送りしたとき、生徒の盤が最後まで付いてくるか。
 *
 * 2026-08-26 の実授業で「20手あたりで生徒側だけ止まる」。
 * クリックで一手ずつ打つ既存テストは通るのに実機で止まったのは、
 * 矢印キーの早送りが送信の密度をずっと高くするため。
 * キーリピートに近い速さで送り、上限に触れない作りかを見る。
 */
test.describe('検討の早送り', () => {
  let teacherContext: BrowserContext;
  let studentContext: BrowserContext;
  let teacherPage: Page;
  let studentPage: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('ff');
    teacherContext = await browser.newContext();
    studentContext = await browser.newContext();
    teacherPage = await teacherContext.newPage();
    studentPage = await studentContext.newPage();

    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.reload();
    await loginAsTeacher(teacherPage);
    await openClassroomAndConnect(teacherPage);
    await loginAsStudent(studentPage, { studentCode: TEST_STUDENT_A.code, classroomId });

    teacherPage.on('console', (m) => {
      if (/\[rtc\]/.test(m.text())) console.log(`[先生] ${m.text().slice(0, 160)}`);
    });
  });

  test.afterEach(async () => {
    await teacherContext?.close();
    await studentContext?.close();
    if (classroomId) await teardownSupabaseRoster(classroomId);
  });

  test('矢印キーで30手を早送りしても、生徒の盤が最後まで付いてくる', async () => {
    const review = await loadSgfForReview(teacherPage, SGF_30);
    await expect(review.getByText('検討モード')).toBeVisible({ timeout: 15_000 });
    await expect(review.getByText('0手目')).toBeVisible({ timeout: 10_000 });

    // キーリピート並みの速さで進める（人が押しっぱなしにしたときに近い）
    for (let i = 0; i < 30; i++) {
      await review.keyboard.press('ArrowRight');
      await review.waitForTimeout(30);
    }

    await expect(review.getByText('30手目')).toBeVisible({ timeout: 15_000 });

    // 生徒の盤に最後の局面が届いているか
    const studentBoard = studentPage.getByTestId('go-board');
    await expect(studentBoard).toBeVisible({ timeout: 15_000 });
    await expect(async () => {
      const stones = await studentBoard.locator('[data-stone]').count();
      expect(stones).toBe(30);
    }).toPass({ timeout: 25_000 });
  });

  test('マウスホイールで一気に進めても、生徒の盤が最後まで付いてくる', async () => {
    const review = await loadSgfForReview(teacherPage, SGF_30);
    await expect(review.getByText('検討モード')).toBeVisible({ timeout: 15_000 });

    // ホイールは矢印キーより桁違いに速い。人が勢いよく回したときに近い密度で送る
    // 実機のホイールは一度の回転で大量のイベントが飛ぶ。間を置かずに送る
    const board = review.getByTestId('go-board');
    await board.hover();
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 40; i++) {
        await review.mouse.wheel(0, 100);
      }
      await review.waitForTimeout(50);
    }

    await expect(review.getByText('30手目')).toBeVisible({ timeout: 15_000 });

    const studentBoard = studentPage.getByTestId('go-board');
    await expect(studentBoard).toBeVisible({ timeout: 15_000 });
    await expect(async () => {
      const stones = await studentBoard.locator('[data-stone]').count();
      expect(stones).toBe(30);
    }).toPass({ timeout: 25_000 });

    // 生徒側が固まっていないこと。この後の一手にも反応する
    await review.getByTitle('一手戻る').click();
    await expect(review.getByText('29手目')).toBeVisible({ timeout: 10_000 });
    await expect(async () => {
      const stones = await studentBoard.locator('[data-stone]').count();
      expect(stones).toBe(29);
    }).toPass({ timeout: 20_000 });
  });

  test('シークバーで途中まで進めてからホイールを回しても、生徒が付いてくる', async () => {
    const review = await loadSgfForReview(teacherPage, SGF_30);
    await expect(review.getByText('検討モード')).toBeVisible({ timeout: 15_000 });

    // まずシークバーで10手目まで
    await review.getByTestId('review-seek-bar').fill('10');
    await expect(review.getByText('10手目')).toBeVisible({ timeout: 10_000 });

    // そこからホイール。実機ではこの条件で5、6手で止まっていた
    const board = review.getByTestId('go-board');
    await board.hover();
    for (let i = 0; i < 60; i++) {
      await review.mouse.wheel(0, 100);
    }

    await expect(review.getByText('30手目')).toBeVisible({ timeout: 15_000 });

    const studentBoard = studentPage.getByTestId('go-board');
    await expect(async () => {
      const stones = await studentBoard.locator('[data-stone]').count();
      expect(stones).toBe(30);
    }).toPass({ timeout: 25_000 });

    // 止まっていないこと。この後の操作にも反応する
    await review.getByTitle('一手戻る').click();
    await expect(async () => {
      const stones = await studentBoard.locator('[data-stone]').count();
      expect(stones).toBe(29);
    }).toPass({ timeout: 20_000 });
  });

  test('ゲージを大きく動かしても、生徒の盤がその局面に揃う', async () => {
    const review = await loadSgfForReview(teacherPage, SGF_30);
    await expect(review.getByText('検討モード')).toBeVisible({ timeout: 15_000 });

    const bar = review.getByTestId('review-seek-bar');
    await expect(bar).toBeVisible({ timeout: 10_000 });

    // 端から端まで往復させる（ドラッグ中に大量の更新が飛ぶ状況）
    for (const v of ['30', '5', '25', '10', '30', '18']) {
      await bar.fill(v);
      await review.waitForTimeout(40);
    }

    await expect(review.getByText('18手目')).toBeVisible({ timeout: 15_000 });

    const studentBoard = studentPage.getByTestId('go-board');
    await expect(studentBoard).toBeVisible({ timeout: 15_000 });
    await expect(async () => {
      const stones = await studentBoard.locator('[data-stone]').count();
      expect(stones).toBe(18);
    }).toPass({ timeout: 25_000 });
  });

  test('10手進むボタンで、生徒の盤も10手先へ揃う', async () => {
    const review = await loadSgfForReview(teacherPage, SGF_30);
    await expect(review.getByText('検討モード')).toBeVisible({ timeout: 15_000 });

    await review.getByTitle('10手進む').click();
    await expect(review.getByText('10手目')).toBeVisible({ timeout: 10_000 });

    const studentBoard = studentPage.getByTestId('go-board');
    await expect(async () => {
      const stones = await studentBoard.locator('[data-stone]').count();
      expect(stones).toBe(10);
    }).toPass({ timeout: 20_000 });
  });
});
