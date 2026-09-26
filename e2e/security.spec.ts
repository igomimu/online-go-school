import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { insertTestLiveGame, readTestLiveGame, teardownSupabaseRoster } from './helpers/setup';

// 環境変数
const supabaseUrl = process.env.VITE_DOJO_SUPABASE_URL || 'https://yzsyrtesydpulctjgdog.supabase.co';
const supabaseAnonKey = process.env.VITE_DOJO_SUPABASE_KEY || 'sb_publishable_MUeJej6uloPhEkU8z79S3g_zTJwDFCM';

test.describe('セキュリティ・認可バリデーション検証 (Stage 9)', () => {
  // テスト用クライアント (anon)
  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  
  const studentA = { uuid: 'd3c90fa1-b1a2-4c3d-8e4f-5a6b7c8d9e0f', code: '1010', email: 'e2e-student-a@test.com' };
  const studentB = { uuid: 'e4d01fa2-b2a3-4c4d-9e5f-6a7b8c9d0e1f', code: '1011', email: 'e2e-student-b@test.com' };

  const classroomA = 'test-class-A-' + Date.now();
  const classroomB = 'test-class-B-' + Date.now();

  let jwtA: string;
  let jwtB: string;

  test.beforeAll(async () => {
    // メールログインにてJWTを取得（429レートリミット回避）
    jwtA = await getStudentJwt(studentA, classroomA);
    jwtB = await getStudentJwt(studentB, classroomB);
  });

  test.afterAll(async () => {
    await Promise.all([
      teardownSupabaseRoster(classroomA),
      teardownSupabaseRoster(classroomB),
    ]);
  });

  // メールログインして検証済みセッション（JWT）を取得するヘルパー
  async function getStudentJwt(student: typeof studentA, classroomId: string): Promise<string> {
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
      email: student.email,
      password: 'password123',
    });

    if (authErr || !authData.session) {
      throw new Error(`signInWithPassword 失敗 (${student.email}): ${authErr?.message}`);
    }
    const jwt = authData.session.access_token;

    const res = await fetch(`${supabaseUrl}/functions/v1/validate_student_session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwt}`,
      },
      body: JSON.stringify({ studentCode: student.code, classroomId }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`validate_student_session 失敗: ${JSON.stringify(err)}`);
    }

    const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
    if (refreshErr || !refreshData.session) {
      throw new Error(`refreshSession 失敗: ${refreshErr?.message}`);
    }

    return refreshData.session.access_token;
  }

  test('無効なJWTでの /api/token は 403 を返す', async ({ request }) => {
    const resInvalidToken = await request.post('/api/token', {
      headers: { 'Authorization': 'Bearer invalid_token_xyz' },
      data: { identity: 'student-A', roomName: 'go-room-1' },
    });
    expect(resInvalidToken.status()).toBe(403);
  });

  // 生徒のJWTで manage_game_action を呼ぶ
  function callAction(request: import('@playwright/test').APIRequestContext, jwt: string, data: Record<string, unknown>) {
    return request.post(`${supabaseUrl}/functions/v1/manage_game_action`, {
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${jwt}` },
      data,
    });
  }

  test('生徒のJWTでは対局を作れない（道場ランクの操作を防ぐ）', async ({ request }) => {
    const createRes = await callAction(request, jwtA, {
      action: 'create',
      params: {
        classroom_id: classroomA,
        black_player: studentA.uuid,
        white_player: 'teacher',
        board_size: 9,
      },
    });
    expect(createRes.status()).toBe(403);
  });

  test('別教室のJWTで対局に介入しようとした場合 403 Forbidden になる', async ({ request }) => {
    // 1. 生徒B が対局者の対局を classroomB に用意する（対局を作れるのは講師だけ）
    const game = await insertTestLiveGame({
      classroomId: classroomB,
      blackPlayer: `sid:${studentB.uuid}`,
      whitePlayer: 'teacher',
    });

    // 2. 生徒A (classroomA所属) の JWT を用いて、生徒B (classroomB所属) の対局を操作しようと試みる (enter_scoring)
    const hackRes = await callAction(request, jwtA, { action: 'enter_scoring', game_id: game.id });
    expect(hackRes.status()).toBe(403);

    // 対局者本人（生徒B）なら同じ操作が通る＝上の 403 は対局者でないことによるもの
    const ownRes = await callAction(request, jwtB, { action: 'enter_scoring', game_id: game.id });
    expect(ownRes.status()).toBe(200);
  });

  test('生徒のJWTを用いて先生専用操作（reset）をしようとした場合 403 Forbidden になる', async ({ request }) => {
    const game = await insertTestLiveGame({
      classroomId: classroomA,
      blackPlayer: `sid:${studentA.uuid}`,
      whitePlayer: 'teacher',
    });

    // 生徒JWTで reset を呼び出す
    const resetRes = await callAction(request, jwtA, { action: 'reset', game_id: game.id });
    expect(resetRes.status()).toBe(403);
  });

  test('生徒は自分の勝ちを書き込めず、自分の投了だけ書ける', async ({ request }) => {
    const game = await insertTestLiveGame({
      classroomId: classroomA,
      blackPlayer: `sid:${studentA.uuid}`,
      whitePlayer: 'teacher',
    });

    // 黒（生徒A）の勝ちは書けない
    for (const result of ['B+R', 'B+T', 'B+10.5']) {
      const res = await callAction(request, jwtA, { action: 'finish', game_id: game.id, params: { result } });
      expect(res.status(), result).toBe(403);
    }
    expect((await readTestLiveGame(game.id)).status).toBe('playing');

    // 自分の投了は書ける
    const resign = await callAction(request, jwtA, { action: 'finish', game_id: game.id, params: { result: 'W+R' } });
    expect(resign.status()).toBe(200);
    expect(await readTestLiveGame(game.id)).toEqual({ status: 'finished', result: 'W+R' });

    // 終局した対局を整地に戻して、ランクの変更を取り消すことはできない
    await callAction(request, jwtA, { action: 'enter_scoring', game_id: game.id });
    expect((await readTestLiveGame(game.id)).status).toBe('finished');
  });
});
