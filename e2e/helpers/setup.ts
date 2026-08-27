import type { Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { TEST_CLASSROOM_NAME, TEST_STUDENT_A, TEST_STUDENT_B } from './test-data';

export function testClassroomName(classroomId: string): string {
  return `${TEST_CLASSROOM_NAME}-${classroomId}`;
}

export async function clearAllData(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.clear());
}

/**
 * 指定した教室IDだけ isTestClassroom 除外フィルタ（classroomStore）の対象外にする。
 * setupClassroomData を通らないブラウザ（別ブラウザの先生ログイン検証など）で、
 * サーバー名簿由来のテスト教室を見えるようにするために使う。
 */
export async function allowTestClassroom(page: Page, classroomId: string): Promise<void> {
  await page.evaluate((id) => {
    localStorage.setItem('go-school-e2e-classroom-id', id);
  }, classroomId);
}

export async function setupTeacherPassword(page: Page, password: string): Promise<void> {
  await page.evaluate(async (pw) => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
    const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('go-school-teacher-pw', hash);
  }, password);
}

/**
 * 生徒A+B登録済み、指定classroomIdに両方所属した教室データを localStorage に書き込む。
 * classroomId をテストごとに変えることで、同一LiveKit Room上でのstate混在を避ける。
 */
export async function setupClassroomData(page: Page, classroomId: string): Promise<void> {
  const classroomName = testClassroomName(classroomId);
  await seedSupabaseRoster(classroomId, classroomName);
  await page.evaluate(({ students, classrooms }) => {
    localStorage.setItem('go-school-students', JSON.stringify(students));
    localStorage.setItem('go-school-classrooms', JSON.stringify(classrooms));
    localStorage.setItem('go-school-e2e-classroom-name', classrooms[0].name);
    localStorage.setItem('go-school-e2e-classroom-id', classrooms[0].id);
  }, {
    students: [
      { id: TEST_STUDENT_A.id, name: TEST_STUDENT_A.name, rank: TEST_STUDENT_A.rank, internalRating: '', type: 'ネット生', grade: '', country: '' },
      { id: TEST_STUDENT_B.id, name: TEST_STUDENT_B.name, rank: TEST_STUDENT_B.rank, internalRating: '', type: 'ネット生', grade: '', country: '' },
    ],
    classrooms: [
      { id: classroomId, name: classroomName, maxCapacity: 10, studentIds: [TEST_STUDENT_A.id, TEST_STUDENT_B.id] },
    ],
  });
}

function readEnvFile(fileName: string): Record<string, string> {
  const filePath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return {};
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const rawValue = trimmed.slice(eq + 1).trim();
    env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
  return env;
}

function getRosterSeedEnv(): { url: string; serviceRoleKey: string } {
  const fileEnv = {
    ...readEnvFile('.env'),
    ...readEnvFile('.env.local'),
  };
  const url = process.env.VITE_DOJO_SUPABASE_URL || fileEnv.VITE_DOJO_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('E2E roster seed requires VITE_DOJO_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }
  return { url, serviceRoleKey };
}

/**
 * テスト生徒に紐づく進行中の対局を消す。
 *
 * 各 spec は finally で teardown するが、実行を強制終了すると片付けが走らない。
 * 残った「対局中」の行は次の実行に影響し、対局を作っても講師の一覧に現れなくなる
 * （2026-08-04、8/1 の byoyomi-voice の残骸 6 件で simul-game が落ちた）。
 * 前の実行がどう終わっていても揃った状態から始められるよう、seed のたびに掃除する。
 */
async function clearStaleTestGames(
  supabase: ReturnType<typeof createClient>,
): Promise<void> {
  const identities = [
    TEST_STUDENT_A.code, TEST_STUDENT_B.code,
    `sid:${TEST_STUDENT_A.code}`, `sid:${TEST_STUDENT_B.code}`,
  ];
  const filter = identities
    .flatMap((id) => [`black_player.eq.${id}`, `white_player.eq.${id}`])
    .join(',');
  const { error } = await supabase
    .from('go_school_live_games')
    .delete()
    .in('status', ['playing', 'scoring'])
    .or(filter);
  if (error) throw new Error(`Failed to clear stale test games: ${error.message}`);
}

async function seedSupabaseRoster(classroomId: string, classroomName: string): Promise<void> {
  const { url, serviceRoleKey } = getRosterSeedEnv();
  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  await clearStaleTestGames(supabase);

  const { error: classroomError } = await supabase
    .from('go_school_classrooms')
    .upsert(
      { id: classroomId, name: classroomName, max_capacity: 10 },
      { onConflict: 'id' },
    );
  if (classroomError) throw new Error(`Failed to seed classroom: ${classroomError.message}`);

  const { error: studentError } = await supabase
    .from('go_school_students')
    .upsert([
      {
        login_id: TEST_STUDENT_A.code,
        name: TEST_STUDENT_A.name,
        classroom_id: classroomId,
        classroom_position: 0,
        rank: TEST_STUDENT_A.rank,
        student_type: 'ネット生',
      },
      {
        login_id: TEST_STUDENT_B.code,
        name: TEST_STUDENT_B.name,
        classroom_id: classroomId,
        classroom_position: 1,
        rank: TEST_STUDENT_B.rank,
        student_type: 'ネット生',
      },
    ], { onConflict: 'login_id' });
  if (studentError) throw new Error(`Failed to seed students: ${studentError.message}`);

  const { error: membershipError } = await supabase
    .from('go_school_classroom_memberships')
    .upsert([
      { classroom_id: classroomId, student_login_id: TEST_STUDENT_A.code, classroom_position: 0 },
      { classroom_id: classroomId, student_login_id: TEST_STUDENT_B.code, classroom_position: 1 },
    ], { onConflict: 'classroom_id,student_login_id' });
  if (membershipError) throw new Error(`Failed to seed memberships: ${membershipError.message}`);
}

/** 教室に発行された共有PC用の鍵を読む（先生が「道場PC用リンクをコピー」で得るもの） */
export async function fetchRosterToken(classroomId: string): Promise<string> {
  const { url, serviceRoleKey } = getRosterSeedEnv();
  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase
    .from('go_school_classrooms')
    .select('roster_token')
    .eq('id', classroomId)
    .maybeSingle();
  if (error) throw new Error(`Failed to read roster token: ${error.message}`);
  return (data?.roster_token as string | null) ?? '';
}

/**
 * 教室に残っている対局だけ消す（名簿はそのまま）。
 *
 * デモ教室のように使い回す教室では、前回の撮影で作った対局が「中断」のまま残り、
 * 次に同じ相手で対局を作っても生徒の画面に出てこない。撮影の前後で掃除する。
 */
export async function clearLiveGames(classroomId: string): Promise<void> {
  const { url, serviceRoleKey } = getRosterSeedEnv();
  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase
    .from('go_school_live_games')
    .delete()
    .eq('classroom_id', classroomId);
  if (error) throw new Error(`Failed to clear live games: ${error.message}`);
}

export async function teardownSupabaseRoster(classroomId: string): Promise<void> {
  try {
    const { url, serviceRoleKey } = getRosterSeedEnv();
    const supabase = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 1. この教室での対局を削除。
    // 🔴 着手を先に消さないと、対局の削除が外部キーで失敗して例外になり、
    // 教室の削除まで到達しない。教室が残ると、テスト生徒が複数の教室に
    // 所属した状態になり、EF の smoke test が「教室を選べ」(409) で落ちる。
    // 握りつぶされるので長く気づかれなかった（2026-08-27）。
    const { data: gameRows, error: gameIdsError } = await supabase
      .from('go_school_live_games')
      .select('id')
      .eq('classroom_id', classroomId);
    if (gameIdsError) {
      throw new Error(`Failed to list live games: ${gameIdsError.message}`);
    }
    const gameIds = (gameRows ?? []).map((row: { id: string }) => row.id);
    if (gameIds.length > 0) {
      const { error: movesError } = await supabase
        .from('go_school_live_moves')
        .delete()
        .in('game_id', gameIds);
      if (movesError) {
        throw new Error(`Failed to delete live moves: ${movesError.message}`);
      }
    }

    const { error: liveGamesError } = await supabase
      .from('go_school_live_games')
      .delete()
      .eq('classroom_id', classroomId);
    if (liveGamesError) {
      throw new Error(`Failed to delete live games: ${liveGamesError.message}`);
    }

    // 2. この教室の所属を解除（他教室の所属は残す）
    const { error: studentsError } = await supabase
      .from('go_school_classroom_memberships')
      .delete()
      .eq('classroom_id', classroomId);
    if (studentsError) {
      throw new Error(`Failed to detach students: ${studentsError.message}`);
    }

    // 3. 教室を削除
    const { error } = await supabase
      .from('go_school_classrooms')
      .delete()
      .eq('id', classroomId);

    if (error) {
      // 教室が消えないと後続のテストと EF の smoke test を巻き込む。警告では見落とす
      throw new Error(`Failed to delete classroom ${classroomId}: ${error.message}`);
    }
  } catch (err) {
    console.error(`[E2E Teardown Error] Failed to cleanup ${classroomId}:`, err);
  }
}
