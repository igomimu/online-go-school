// online-go-school: validate_student_session
//
// Anonymous Sign-In で作られた anon user の user_metadata に、検証済みの
// student_id / classroom_id / app_role を書き込む Edge Function。
//
// フロー:
//   1. フロントが supabase.auth.signInAnonymously() で anon user 作成
//   2. その JWT を Authorization: Bearer ヘッダーで本関数に POST
//   3. 本関数が JWT を検証 → sub (anon user uuid) 取得
//   4. body の studentCode をオンライン名簿で照合
//   5. 所属が1教室なら自動確定。複数ならリンク指定の教室を検証し、
//      指定なし/不一致なら所属教室の選択肢を返す
//   6. service_role で auth.admin.updateUserById により user_metadata を上書き
//   7. フロントが supabase.auth.refreshSession() で metadata 反映済み JWT を受ける
//   8. custom_access_token_hook が user_metadata を JWT claim に昇格
//
// classroom_id はクライアント入力を信用しない。所属テーブルを正本にして
// canonical ID をJWTへ書き込む。

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { versionResponse } from '../_shared/version.ts'
import { resolveClassroomSelection, type ClassroomChoice } from '../_shared/classroom_membership.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

interface ValidateRequest {
  studentCode: string
  classroomId?: string
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
  if (req.method === 'GET') {
    return versionResponse('validate_student_session', corsHeaders)
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
  if (!body.studentCode) {
    return json({ error: 'studentCode is required' }, 400)
  }

  if (body.studentCode.length > 50) {
    return json({ error: 'Invalid studentCode format' }, 400)
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

  const admin = createClient(supabaseUrl, serviceRoleKey)
  let resolvedId: string | null = null
  let resolvedName: string | null = null
  let classrooms: ClassroomChoice[] = []

  // ① オンライン道場 専用名簿(go_school_students)を最優先で照合（道場アプリとは独立）
  const { data: gsStudent, error: gsErr } = await admin
    .from('go_school_students')
    .select('login_id, name')
    .eq('login_id', body.studentCode)
    .maybeSingle()
  if (gsErr) {
    return json({ error: 'Roster lookup failed', detail: gsErr.message }, 500)
  }
  if (gsStudent) {
    resolvedId = gsStudent.login_id
    resolvedName = gsStudent.name || gsStudent.login_id
    const { data: memberships, error: membershipErr } = await admin
      .from('go_school_classroom_memberships')
      .select('classroom_id, go_school_classrooms!inner(name)')
      .eq('student_login_id', gsStudent.login_id)
    if (membershipErr) {
      return json({ error: 'Membership lookup failed', detail: membershipErr.message }, 500)
    }
    classrooms = (memberships ?? []).map((row) => {
      const linked = row.go_school_classrooms as unknown as { name?: string } | { name?: string }[] | null
      const classroom = Array.isArray(linked) ? linked[0] : linked
      return {
        id: row.classroom_id as string,
        name: classroom?.name || (row.classroom_id as string),
      }
    })
  } else {
    // ② 移行期フォールバック: 道場DB(student_code / UUID)でも照合
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    const isUuid = uuidRegex.test(body.studentCode)
    const baseQuery = admin
      .from('students')
      .select('id, name, student_type, status')
      .eq('student_type', 'net')
      .eq('status', 'active')
    const { data: student, error: lookupErr } = await (
      isUuid
        ? baseQuery.eq('id', body.studentCode)
        : baseQuery.eq('student_code', body.studentCode)
    ).maybeSingle()
    if (lookupErr) {
      return json({ error: 'Student lookup failed', detail: lookupErr.message }, 500)
    }
    if (student) {
      resolvedId = student.id
      resolvedName = student.name
    }
  }

  if (!resolvedId) {
    return json({ error: 'Student not found or inactive' }, 403)
  }

  if (classrooms.length === 0) {
    return json({ error: 'No classroom membership', code: 'no_classroom_membership' }, 403)
  }

  const requestedClassroomId = (body.classroomId || '').trim()
  const { selected: selectedClassroom } = resolveClassroomSelection(classrooms, requestedClassroomId)

  if (!selectedClassroom) {
    return json({
      error: 'Classroom selection required',
      code: 'classroom_selection_required',
      classrooms,
    }, 409)
  }

  // user_metadata 上書き
  const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
    user_metadata: {
      student_id: resolvedId,
      classroom_id: selectedClassroom.id,
      app_role: 'student',
      display_name: resolvedName,
    },
  })
  if (updateErr) {
    return json({ error: 'Failed to update user metadata', detail: updateErr.message }, 500)
  }

  return json({
    ok: true,
    display_name: resolvedName,
    student_id: resolvedId,
    classroom_id: selectedClassroom.id,
    classroom_name: selectedClassroom.name,
    classroom_corrected: requestedClassroomId !== '' && requestedClassroomId !== selectedClassroom.id,
  })
})
