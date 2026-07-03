import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const functions = [
  'validate_student_session',
  'validate_teacher_session',
  'fetch_students',
  'manage_game_action',
  'submit_move',
];

function loadDotEnv(fileName) {
  const filePath = path.join(projectRoot, fileName);
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [rawKey, ...rest] = trimmed.split('=');
    const key = rawKey.trim();
    if (process.env[key]) continue;
    const rawValue = rest.join('=').trim();
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
}

loadDotEnv('.env.local');
loadDotEnv('.env');

function requiredEnv(...names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  throw new Error(`Missing required env: ${names.join(' or ')}`);
}

function functionsBaseUrl(supabaseUrl) {
  return `${supabaseUrl.replace(/\/$/, '')}/functions/v1`;
}

async function getJson(url, anonKey) {
  const res = await fetch(url, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok) {
    throw new Error(`${url} returned HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return body;
}

async function verifyVersions(baseUrl, anonKey, expectedVersion) {
  for (const fn of functions) {
    const body = await getJson(`${baseUrl}/${fn}`, anonKey);
    if (body?.version !== expectedVersion || body?.function !== fn) {
      throw new Error(
        `${fn} version mismatch: expected ${expectedVersion}, got ${JSON.stringify(body)}`,
      );
    }
    console.log(`[SMOKE] ${fn} version OK: ${body.version}`);
  }
}

async function verifyStudentSession(supabaseUrl, anonKey, baseUrl) {
  const studentCode = process.env.EDGE_SMOKE_STUDENT_CODE || '1010';
  const classroomId = process.env.EDGE_SMOKE_CLASSROOM_ID || `ci-smoke-${Date.now()}`;
  const supabase = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error || !data.session?.access_token) {
    throw new Error(`Anonymous sign-in failed: ${error?.message || 'no session'}`);
  }

  const res = await fetch(`${baseUrl}/validate_student_session`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${data.session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ studentCode, classroomId }),
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  if (!res.ok || body?.ok !== true) {
    throw new Error(`validate_student_session smoke failed: HTTP ${res.status} ${text.slice(0, 300)}`);
  }

  console.log(`[SMOKE] validate_student_session POST OK for test student ${studentCode}`);
}

async function main() {
  const supabaseUrl = requiredEnv('SUPABASE_URL', 'VITE_DOJO_SUPABASE_URL');
  const anonKey = requiredEnv('SUPABASE_ANON_KEY');
  const expectedVersion = requiredEnv('EXPECTED_EDGE_VERSION', 'GITHUB_SHA');
  const baseUrl = functionsBaseUrl(supabaseUrl);

  console.log(`[SMOKE] Target functions: ${baseUrl}`);
  console.log(`[SMOKE] Expected edge version: ${expectedVersion}`);
  await verifyVersions(baseUrl, anonKey, expectedVersion);
  await verifyStudentSession(supabaseUrl, anonKey, baseUrl);
  console.log('[SMOKE] Edge Functions deployment smoke passed.');
}

main().catch((err) => {
  console.error(`[SMOKE] ${err.message}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `## Edge Functions smoke failed\n\n${err.message}\n`,
    );
  }
  process.exit(1);
});
