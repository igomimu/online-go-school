import { readFileSync } from 'node:fs';

/**
 * E2E が作ったテスト教室を、走り終わったあとに消す。
 *
 * 各 spec は `E2Eテスト教室-<時刻>-<乱数>` という教室を作るが、後片付けが無かったため
 * 本番の名簿に溜まり続けていた。テスト生徒 1010 が8つの教室に所属した結果、
 * 教室を指定しないログインが「どの教室か決められない」で 409 を返すようになり、
 * デプロイ後のスモークテストが落ちた（2026-09-07 Codex レビュー #6）。
 *
 * 消すのは名前が「E2Eテスト教室」で始まる教室と、その所属だけ。
 * 実教室（ネット道場・指導碁・芳織教室・デモ教室）には触れない。
 */

const TEST_CLASSROOM_PREFIX = 'E2Eテスト教室';

function readEnvFile(): Record<string, string> {
  try {
    return Object.fromEntries(
      readFileSync('.env', 'utf8')
        .split('\n')
        .filter((line) => line.includes('=') && !line.trimStart().startsWith('#'))
        .map((line) => [line.slice(0, line.indexOf('=')).trim(), line.slice(line.indexOf('=') + 1).trim()]),
    );
  } catch {
    return {};
  }
}

export default async function globalTeardown(): Promise<void> {
  const env = { ...readEnvFile(), ...process.env } as Record<string, string>;
  const url = env.VITE_DOJO_SUPABASE_URL;
  const key = env.VITE_DOJO_SUPABASE_KEY;
  const password = process.env.TEST_TEACHER_PASSWORD;

  if (!url || !key) {
    console.warn('[teardown] Supabase の接続先が無いので後片付けを飛ばす');
    return;
  }
  if (!password) {
    console.warn('[teardown] TEST_TEACHER_PASSWORD が無いので後片付けを飛ばす（教室の削除は先生権限が要る）');
    return;
  }

  const headers = { apikey: key, 'Content-Type': 'application/json' };

  try {
    // 先生セッションを作る（教室の削除は RLS で先生のみ）
    const anon = await (await fetch(`${url}/auth/v1/signup`, { method: 'POST', headers, body: '{}' })).json();
    if (!anon.access_token) throw new Error('匿名サインインに失敗');

    const validated = await fetch(`${url}/functions/v1/validate_teacher_session`, {
      method: 'POST',
      headers: { ...headers, Authorization: `Bearer ${anon.access_token}` },
      body: JSON.stringify({ password, classroomId: 'global' }),
    });
    if (!validated.ok) throw new Error(`先生セッションを作れない (${validated.status})`);

    const refreshed = await (await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST', headers, body: JSON.stringify({ refresh_token: anon.refresh_token }),
    })).json();
    const token = refreshed.access_token;
    if (!token) throw new Error('トークンを更新できない');

    const auth = { ...headers, Authorization: `Bearer ${token}` };

    const rooms = await (await fetch(
      `${url}/rest/v1/go_school_classrooms?select=id&name=like.${encodeURIComponent(`${TEST_CLASSROOM_PREFIX}%`)}`,
      { headers: auth },
    )).json() as Array<{ id: string }>;

    if (!Array.isArray(rooms) || rooms.length === 0) {
      console.log('[teardown] 消すテスト教室は無し');
      return;
    }

    const ids = rooms.map((r) => r.id);
    const inList = `(${ids.map((id) => `"${id}"`).join(',')})`;

    await fetch(`${url}/rest/v1/go_school_classroom_memberships?classroom_id=in.${encodeURIComponent(inList)}`,
      { method: 'DELETE', headers: auth });
    await fetch(`${url}/rest/v1/go_school_classrooms?id=in.${encodeURIComponent(inList)}`,
      { method: 'DELETE', headers: auth });

    console.log(`[teardown] テスト教室 ${ids.length} 件を削除した`);
  } catch (err) {
    // 後片付けの失敗でテスト結果を塗り替えない。次回の実行か手動で消せばよい
    console.warn('[teardown] テスト教室の後片付けに失敗:', err instanceof Error ? err.message : err);
  }
}
