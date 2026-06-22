import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

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

  test('別教室のJWTで対局に介入しようとした場合 403 Forbidden になる', async ({ request }) => {
    // 1. 生徒B の権限で classroomB に対局を作成する
    const createRes = await request.post(`${supabaseUrl}/functions/v1/manage_game_action`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtB}`
      },
      data: {
        action: 'create',
        params: {
          classroom_id: classroomB,
          black_player: studentB.uuid,
          white_player: 'teacher-id',
          board_size: 9,
        }
      }
    });
    expect(createRes.status()).toBe(200);
    const { game } = await createRes.json();
    const gameId = game.id;

    // 2. 生徒A (classroomA所属) の JWT を用いて、生徒B (classroomB所属) の対局を操作しようと試みる (enter_scoring)
    const hackRes = await request.post(`${supabaseUrl}/functions/v1/manage_game_action`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtA}`
      },
      data: {
        action: 'enter_scoring',
        game_id: gameId,
      }
    });
    expect(hackRes.status()).toBe(403);
  });

  test('生徒のJWTを用いて先生専用操作（reset）をしようとした場合 403 Forbidden になる', async ({ request }) => {
    // まず対局を作る
    const createRes = await request.post(`${supabaseUrl}/functions/v1/manage_game_action`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtA}`
      },
      data: {
        action: 'create',
        params: {
          classroom_id: classroomA,
          black_player: studentA.uuid,
          white_player: 'teacher-id',
          board_size: 9,
        }
      }
    });
    const { game } = await createRes.json();

    // 生徒JWTで reset を呼び出す
    const resetRes = await request.post(`${supabaseUrl}/functions/v1/manage_game_action`, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${jwtA}`
      },
      data: {
        action: 'reset',
        game_id: game.id,
      }
    });
    expect(resetRes.status()).toBe(403);
  });
});
