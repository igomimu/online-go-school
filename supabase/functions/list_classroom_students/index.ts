// online-go-school: list_classroom_students
//
// 生徒の端末が、自分の教室の仲間（氏名と棋力）と、教室の棋力表示設定を取る口。
//
// なぜ Edge Function か:
//   go_school_students は先生の JWT でしか読めない（RLS）。生徒の画面は
//   参加者一覧に棋力を出すが、生徒は名簿を読めないので出せなかった（2026-08-16）。
//
// どの教室を返すか:
//   JWT の user_metadata.classroom_id は、ログイン時に本人が入力した値をそのまま
//   書いたものなので信用しない。名簿で student_id から所属教室を引き直し、
//   それを正本にする。名簿に居ない移行期の生徒だけ metadata を使う。
//
// 返すもの: 同じ教室の生徒の login_id・氏名・段級・ランクと、教室名・棋力表示。
// 生年月日・学年・所在地・共有PCの鍵は返さない（生徒の画面に要らない）。

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { versionResponse } from '../_shared/version.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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
    return versionResponse('list_classroom_students', corsHeaders)
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ error: 'Server misconfigured' }, 500)
  }

  const anonClient = createClient(supabaseUrl, anonKey)
  const { data: userResult, error: userErr } = await anonClient.auth.getUser(jwt)
  if (userErr || !userResult?.user) {
    return json({ error: 'Invalid or expired token' }, 401)
  }

  const meta = userResult.user.user_metadata ?? {}
  if (meta.app_role !== 'student') {
    return json({ error: 'Forbidden: student session required' }, 403)
  }
  const studentId = typeof meta.student_id === 'string' ? meta.student_id : ''
  if (!studentId) {
    return json({ error: 'Forbidden: no student in session' }, 403)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { data: me, error: meErr } = await admin
    .from('go_school_students')
    .select('classroom_id')
    .eq('login_id', studentId)
    .maybeSingle()
  if (meErr) {
    return json({ error: 'Roster lookup failed', detail: meErr.message }, 500)
  }

  // 名簿に居る生徒は所属教室が正本。居ない（道場DB経由の移行期）生徒だけ metadata を使う
  const classroomId = (me?.classroom_id as string | null)
    ?? (typeof meta.classroom_id === 'string' ? meta.classroom_id : '')
  if (!classroomId) {
    return json({ error: 'No classroom for this student' }, 404)
  }

  const [{ data: classroom, error: classroomErr }, { data: students, error: studentsErr }] = await Promise.all([
    admin
      .from('go_school_classrooms')
      .select('id, name, rank_display')
      .eq('id', classroomId)
      .maybeSingle(),
    admin
      .from('go_school_students')
      .select('login_id, name, rank, internal_rating, classroom_position')
      .eq('classroom_id', classroomId),
  ])
  if (classroomErr) {
    return json({ error: 'Classroom lookup failed', detail: classroomErr.message }, 500)
  }
  if (studentsErr) {
    return json({ error: 'Roster lookup failed', detail: studentsErr.message }, 500)
  }

  // 先生が決めた並び順（classroom_position）を尊重し、無い分は名前順で後ろに置く
  const roster = (students ?? [])
    .map(s => ({
      id: s.login_id as string,
      name: (s.name as string) || (s.login_id as string),
      rank: (s.rank as string | null) ?? '',
      internalRating: (s.internal_rating as string | null) ?? '',
      position: (s.classroom_position as number | null) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => (a.position !== b.position ? a.position - b.position : a.name.localeCompare(b.name, 'ja')))
    .map(({ id, name, rank, internalRating }) => ({ id, name, rank, internalRating }))

  return json({
    classroom: {
      id: classroomId,
      name: (classroom?.name as string | null) || classroomId,
      rankDisplay: classroom?.rank_display === 'rating' ? 'rating' : 'dan_kyu',
    },
    students: roster,
  })
})
