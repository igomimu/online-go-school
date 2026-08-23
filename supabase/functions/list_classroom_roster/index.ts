// online-go-school: list_classroom_roster
//
// 道場の共有PC用。名前を選ぶだけで入れる画面に出す名簿を返す（2026-08-13 三村さん）。
//
// なぜ Edge Function か:
//   go_school_students は先生の JWT でしか読めない（RLS）。共有PCの画面は
//   ログイン前に名簿を出す必要があるので、service_role で読んで返す口が要る。
//
// なぜ教室IDではなく専用トークンか:
//   教室IDは招待リンクに入っていて生徒全員が持っている。それだけで氏名一覧が
//   引けると、道場の生徒名簿がリンクを持つ誰にでも見えてしまう。共有PCに置く
//   鍵は別立てにして、先生が発行した端末だけが名簿を取れるようにする。
//
// 返すもの: その教室に所属する生徒の 4桁コードと氏名だけ。
// 棋力・生年月日・所在地などは返さない（共有PCの画面に出す必要がない）。

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { versionResponse } from '../_shared/version.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

interface RosterRequest {
  rosterToken: string
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
    return versionResponse('list_classroom_roster', corsHeaders)
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  let body: RosterRequest
  try {
    body = await req.json() as RosterRequest
  } catch {
    return json({ error: 'Invalid JSON' }, 400)
  }

  const token = (body.rosterToken || '').trim()
  // 24桁hex固定。形の違うものはDBに問い合わせるまでもなく弾く
  if (!/^[0-9a-f]{24}$/.test(token)) {
    return json({ error: 'Invalid roster token' }, 400)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'Server misconfigured' }, 500)
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { data: classroom, error: classroomErr } = await admin
    .from('go_school_classrooms')
    .select('id, name')
    .eq('roster_token', token)
    .maybeSingle()
  if (classroomErr) {
    return json({ error: 'Classroom lookup failed', detail: classroomErr.message }, 500)
  }
  if (!classroom) {
    return json({ error: 'Invalid roster token' }, 404)
  }

  const { data: memberships, error: membershipsErr } = await admin
    .from('go_school_classroom_memberships')
    .select('student_login_id, classroom_position')
    .eq('classroom_id', classroom.id)
  if (membershipsErr) {
    return json({ error: 'Roster lookup failed', detail: membershipsErr.message }, 500)
  }

  const loginIds = (memberships ?? []).map(m => m.student_login_id as string)
  const { data: students, error: studentsErr } = loginIds.length === 0
    ? { data: [], error: null }
    : await admin
      .from('go_school_students')
      .select('login_id, name')
      .in('login_id', loginIds)
  if (studentsErr) {
    return json({ error: 'Student lookup failed', detail: studentsErr.message }, 500)
  }

  const positionByStudent = new Map(
    (memberships ?? []).map(m => [m.student_login_id as string, m.classroom_position as number | null]),
  )

  // 先生が決めた並び順（classroom_position）を尊重し、無い分は名前順で後ろに置く
  const roster = (students ?? [])
    .map(s => ({
      studentCode: s.login_id as string,
      name: (s.name as string) || (s.login_id as string),
      position: positionByStudent.get(s.login_id as string) ?? Number.MAX_SAFE_INTEGER,
    }))
    .sort((a, b) => (a.position !== b.position ? a.position - b.position : a.name.localeCompare(b.name, 'ja')))
    .map(({ studentCode, name }) => ({ studentCode, name }))

  return json({
    classroomId: classroom.id as string,
    classroomName: (classroom.name as string) || (classroom.id as string),
    students: roster,
  })
})
