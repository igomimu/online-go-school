import type { Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { TEST_CLASSROOM_NAME, TEST_STUDENT_A, TEST_STUDENT_B } from './test-data';

export function testClassroomName(classroomId: string): string {
  return `${TEST_CLASSROOM_NAME}-${classroomId}`;
}

export async function clearAllData(page: Page): Promise<void> {
  await page.evaluate(() => localStorage.clear());
}

export async function setupTeacherPassword(page: Page, password: string): Promise<void> {
  await page.evaluate(async (pw) => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pw));
    const hash = Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('go-school-teacher-pw', hash);
  }, password);
}

/**
 * 生徒A+B登録済み、指定classroomIdに両方所属した教室データを localStorage に書き込む。
 * classroomId をテストごとに変えることで、同一LiveKit Room上でのstate混在を避ける。
 */
export async function setupClassroomData(page: Page, classroomId: string): Promise<void> {
  const classroomName = testClassroomName(classroomId);
  await seedSupabaseRoster(classroomId, classroomName);
  await page.evaluate(({ students, classrooms }) => {
    localStorage.setItem('go-school-students', JSON.stringify(students));
    localStorage.setItem('go-school-classrooms', JSON.stringify(classrooms));
    localStorage.setItem('go-school-e2e-classroom-name', classrooms[0].name);
    localStorage.setItem('go-school-e2e-classroom-id', classrooms[0].id);
  }, {
    students: [
      { id: TEST_STUDENT_A.id, name: TEST_STUDENT_A.name, rank: TEST_STUDENT_A.rank, internalRating: '', type: 'ネット生', grade: '', country: '' },
      { id: TEST_STUDENT_B.id, name: TEST_STUDENT_B.name, rank: TEST_STUDENT_B.rank, internalRating: '', type: 'ネット生', grade: '', country: '' },
    ],
    classrooms: [
      { id: classroomId, name: classroomName, maxCapacity: 10, studentIds: [TEST_STUDENT_A.id, TEST_STUDENT_B.id] },
    ],
  });
}

function readEnvFile(fileName: string): Record<string, string> {
  const filePath = path.resolve(process.cwd(), fileName);
  if (!fs.existsSync(filePath)) return {};
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const rawValue = trimmed.slice(eq + 1).trim();
    env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
  return env;
}

function getRosterSeedEnv(): { url: string; serviceRoleKey: string } {
  const fileEnv = {
    ...readEnvFile('.env'),
    ...readEnvFile('.env.local'),
  };
  const url = process.env.VITE_DOJO_SUPABASE_URL || fileEnv.VITE_DOJO_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error('E2E roster seed requires VITE_DOJO_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  }
  return { url, serviceRoleKey };
}

async function seedSupabaseRoster(classroomId: string, classroomName: string): Promise<void> {
  const { url, serviceRoleKey } = getRosterSeedEnv();
  const supabase = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: classroomError } = await supabase
    .from('go_school_classrooms')
    .upsert(
      { id: classroomId, name: classroomName, max_capacity: 10 },
      { onConflict: 'id' },
    );
  if (classroomError) throw new Error(`Failed to seed classroom: ${classroomError.message}`);

  const { error: studentError } = await supabase
    .from('go_school_students')
    .upsert([
      {
        login_id: TEST_STUDENT_A.code,
        name: TEST_STUDENT_A.name,
        classroom_id: classroomId,
        classroom_position: 0,
        rank: TEST_STUDENT_A.rank,
        student_type: 'ネット生',
      },
      {
        login_id: TEST_STUDENT_B.code,
        name: TEST_STUDENT_B.name,
        classroom_id: classroomId,
        classroom_position: 1,
        rank: TEST_STUDENT_B.rank,
        student_type: 'ネット生',
      },
    ], { onConflict: 'login_id' });
  if (studentError) throw new Error(`Failed to seed students: ${studentError.message}`);
}
