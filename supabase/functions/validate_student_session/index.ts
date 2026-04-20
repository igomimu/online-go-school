// online-go-school: validate_student_session
//
// Anonymous Sign-In で作られた anon user の user_metadata に、検証済みの
// student_id / classroom_id / app_role を書き込む Edge Function。
//
// フロー:
//   1. フロントが supabase.auth.signInAnonymously() で anon user 作成
//   2. その JWT を Authorization: Bearer ヘッダーで本関数に POST
//   3. 本関数が JWT を検証 → sub (anon user uuid) 取得
//   4. body の studentId を dojo-app students で照合
//      (student_type='net', status='active')
//   5. service_role で auth.admin.updateUserById により user_metadata を上書き
//   6. フロントが supabase.auth.refreshSession() で metadata 反映済み JWT を受ける
//   7. custom_access_token_hook が user_metadata を JWT claim に昇格
//
// classroom_id について:
//   dojo-app `students` に classroom_id カラムは存在しない。classroom は
//   online-go-school の先生ブラウザ localStorage で管理されているため、
//   本関数では classroom_id を検証せず body の値をそのまま user_metadata に
//   書き込む。Stage 7 の RLS では student_id / app_role を主ゲートとし、
//   classroom_id は UX グルーピング用途にとどめる。

import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface ValidateRequest {
  studentId: string
  classroomId: string
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
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
  if (!body.studentId || !body.classroomId) {
    return json({ error: 'studentId and classroomId are required' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
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

  // dojo-app students 照合
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: student, error: lookupErr } = await admin
    .from('students')
    .select('id, name, student_type, status')
    .eq('id', body.studentId)
    .eq('student_type', 'net')
    .eq('status', 'active')
    .maybeSingle()

  if (lookupErr) {
    return json({ error: 'Student lookup failed', detail: lookupErr.message }, 500)
  }
  if (!student) {
    return json({ error: 'Student not found or inactive' }, 403)
  }

  // user_metadata 上書き
  const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      student_id: student.id,
      classroom_id: body.classroomId,
      app_role: 'student',
    },
  })
  if (updateErr) {
    return json({ error: 'Failed to update user metadata', detail: updateErr.message }, 500)
  }

  return json({
    ok: true,
    display_name: student.name,
    student_id: student.id,
    classroom_id: body.classroomId,
  })
})
