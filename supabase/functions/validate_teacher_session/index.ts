// online-go-school: validate_teacher_session
//
// Anonymous Sign-In で作られた anon user の user_metadata に、検証済みの
// teacher_id / classroom_id / app_role = 'teacher' を書き込む Edge Function。
//
// フロー:
//   1. フロントが supabase.auth.signInAnonymously() で anon user 作成
//   2. その JWT を Authorization: Bearer ヘッダーで本関数に POST
//   3. 本関数が JWT を検証 → sub (anon user uuid) 取得
//   4. body の password をハッシュ化して環境変数 TEACHER_PASSWORD_HASH と照合
//   5. service_role で auth.admin.updateUserById により user_metadata を上書き
//   6. フロントが supabase.auth.refreshSession() で metadata 反映済み JWT を受ける
//   7. custom_access_token_hook が user_metadata を JWT claim に昇格

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { versionResponse } from '../_shared/version.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

interface ValidateRequest {
  password?: string
  classroomId?: string
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// SHA-256 ハッシュ化ヘルパー
async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method === 'GET') {
    return versionResponse('validate_teacher_session', corsHeaders)
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader.startsWith('Bearer ')) {
    return json({ error: 'Missing Bearer token' }, 401)
  }
  const jwt = authHeader.slice('Bearer '.length).trim()
  if (!jwt) {
    return json({ error: 'Empty Bearer token' }, 401)
  }

  let body: ValidateRequest
  try {
    body = await req.json() as ValidateRequest
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }
  if (!body.password) {
    return json({ error: 'password is required' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const expectedHash = Deno.env.get('TEACHER_PASSWORD_HASH')

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !expectedHash) {
    return json({ error: 'Server misconfigured' }, 500)
  }

  // JWT 検証: anon key client で getUser(token) を呼ぶと Supabase が検証
  const anonClient = createClient(supabaseUrl, anonKey)
  const { data: userResult, error: userErr } = await anonClient.auth.getUser(jwt)
  if (userErr || !userResult?.user) {
    return json({ error: 'Invalid or expired token' }, 401)
  }
  const user = userResult.user
  if (!user.is_anonymous) {
    return json({ error: 'Only anonymous sessions can be validated' }, 403)
  }

  // パスワード照合
  const hashedInput = await sha256(body.password)
  if (hashedInput !== expectedHash) {
    return json({ error: 'Invalid teacher password' }, 403)
  }

  // user_metadata 上書き
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      teacher_id: user.id, // teacher_id として自身の UUID をセット
      classroom_id: body.classroomId ?? 'global',
      app_role: 'teacher',
    },
  })
  if (updateErr) {
    return json({ error: 'Failed to update user metadata', detail: updateErr.message }, 500)
  }

  return json({
    ok: true,
    teacher_id: user.id,
    app_role: 'teacher',
  })
})
