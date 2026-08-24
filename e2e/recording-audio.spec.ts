import { test, expect, type Page, type BrowserContext } from '@playwright/test';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TEST_STUDENT_A, TEST_TEACHER_PASSWORD, generateClassroomId } from './helpers/test-data';
import { clearAllData, setupTeacherPassword, setupClassroomData, teardownSupabaseRoster } from './helpers/setup';
import { loginAsStudent } from './helpers/student-actions';
import { loginAsTeacher, openClassroomAndConnect } from './helpers/teacher-actions';

/**
 * 講師の録画に声が入っているかを、できあがったファイルの中身で確かめる。
 *
 * 以前は getDisplayMedia を audio:false で呼んでいたため、90分録っても
 * 完全な無音の動画しかできなかった（2026-08-25 発覚）。画面の映像が録れている
 * ことだけでは気づけないので、ffprobe で音声トラックの有無を、ffmpeg の
 * volumedetect で「本当に音が鳴っているか」まで見る。
 */

// 画面共有のダイアログを自動で通す。config の指定を上書きするので media 系も並べ直す
test.use({
  launchOptions: {
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--auto-select-desktop-capture-source=Entire screen',
    ],
  },
});

const hasFfmpeg = ['ffprobe', 'ffmpeg'].every((bin) => {
  try { execFileSync('which', [bin]); return true; } catch { return false; }
});

test.describe('講師の録画', () => {
  let teacherContext: BrowserContext;
  let studentContext: BrowserContext;
  let teacherPage: Page;
  let studentPage: Page;
  let classroomId: string;

  test.beforeEach(async ({ browser }) => {
    classroomId = generateClassroomId('rec');
    teacherContext = await browser.newContext();
    studentContext = await browser.newContext();
    teacherPage = await teacherContext.newPage();
    studentPage = await studentContext.newPage();

    await teacherPage.goto('/');
    await clearAllData(teacherPage);
    await setupTeacherPassword(teacherPage, TEST_TEACHER_PASSWORD);
    await setupClassroomData(teacherPage, classroomId);
    await teacherPage.reload();
    await loginAsTeacher(teacherPage, TEST_TEACHER_PASSWORD);
    await openClassroomAndConnect(teacherPage);

    await studentPage.goto('/');
    await clearAllData(studentPage);
    await studentPage.reload();
  });

  test.afterEach(async () => {
    await teacherContext?.close();
    await studentContext?.close();
    await teardownSupabaseRoster(classroomId);
  });

  test('自分の声と生徒の声が入った動画ができる', async () => {
    test.skip(!hasFfmpeg, 'ffprobe / ffmpeg が無い環境では中身を確かめられない');

    await loginAsStudent(studentPage, { studentCode: TEST_STUDENT_A.code, classroomId });
    await studentPage.locator('header button', { hasText: 'マイク' }).first().click();
    await teacherPage.locator('header button[title="マイクON"]').click();

    // 先生のマイク＋生徒のマイクで2つ
    await teacherPage.getByRole('button', { name: '録画' }).click();
    await expect(teacherPage.getByText('声 2')).toBeVisible({ timeout: 20_000 });

    await teacherPage.waitForTimeout(6_000);
    await teacherPage.getByRole('button', { name: '停止' }).click();

    const downloadPromise = teacherPage.waitForEvent('download');
    await teacherPage.getByRole('button', { name: '保存' }).click();
    const download = await downloadPromise;
    // RECORDING_OUT を指定すると録れたものを手元に残せる（中身を目で確かめたいとき）
    const file = process.env.RECORDING_OUT ?? join(mkdtempSync(join(tmpdir(), 'rec-')), 'recording.webm');
    await download.saveAs(file);
    expect(existsSync(file)).toBe(true);

    // 音声トラックがあるか
    const probe = execFileSync('ffprobe', [
      '-v', 'error', '-show_entries', 'stream=codec_type,codec_name', '-of', 'json', file,
    ]).toString();
    const streams = (JSON.parse(probe).streams ?? []) as { codec_type: string; codec_name: string }[];
    expect(streams.map(s => s.codec_type)).toContain('video');
    expect(streams.map(s => s.codec_type)).toContain('audio');

    // 中身が本当に鳴っているか（無音なら mean_volume は -90dB 付近まで落ちる）
    // volumedetect の結果は stderr に出るので spawnSync で受ける
    const detect = spawnSync('ffmpeg', ['-i', file, '-af', 'volumedetect', '-f', 'null', '-'],
      { encoding: 'utf8' });
    const mean = /mean_volume:\s*(-?[\d.]+) dB/.exec(detect.stderr ?? '')?.[1];
    expect(mean, 'mean_volume が読めない').toBeDefined();
    expect(Number(mean)).toBeGreaterThan(-60);
    console.log(`録画: ${streams.map(s => `${s.codec_type}=${s.codec_name}`).join(' ')} / mean_volume=${mean}dB`);
  });
});
