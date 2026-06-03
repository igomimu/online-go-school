import { createClient } from 'jsr:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
    return json({ error: 'Invalid or expired token', detail: userErr?.message }, 401)
  }
  
  const user = userResult.user
  const meta = user.user_metadata ?? {}
  const role = meta.app_role

  // 先生（teacher）のみ生徒リストを取得可能にする
  if (role !== 'teacher') {
    return json({ error: 'Forbidden: Only teachers can fetch student list' }, 403)
  }

  // service_role で dojo-app students を取得
  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: students, error: lookupErr } = await admin
    .from('students')
    .select('id, name, rank, student_type, grade, address, kakuzuke, birthdate')
    .eq('student_type', 'net')
    .eq('status', 'active')
    .order('name')

  if (lookupErr) {
    return json({ error: 'Failed to fetch students', detail: lookupErr.message }, 500)
  }

  return json({ students })
})
