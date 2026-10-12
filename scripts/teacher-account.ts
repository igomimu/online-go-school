// 講師アカウントの管理（go_school_teachers）。2026-10-12〜
//
//   npx tsx scripts/teacher-account.ts list
//   npx tsx scripts/teacher-account.ts add <ログインID> <表示名> [パスワード]   # 省略時は自動で作って表示
//   npx tsx scripts/teacher-account.ts password <ログインID> [パスワード]
//   npx tsx scripts/teacher-account.ts rename <ログインID> <表示名>
//   npx tsx scripts/teacher-account.ts disable <ログインID>   # ログインできなくする
//   npx tsx scripts/teacher-account.ts enable <ログインID>
//
// 接続先は VITE_DOJO_SUPABASE_URL、鍵は SUPABASE_SERVICE_ROLE_KEY（環境変数か .env / .env.local）。

import fs from 'node:fs';
import path from 'node:path';
import { randomInt } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { hashTeacherPassword } from '../supabase/functions/_shared/teacherPassword.ts';

function readEnvFile(file: string): Record<string, string> {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) return {};
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(p, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const fileEnv = { ...readEnvFile('.env'), ...readEnvFile('.env.local') };
const url = process.env.VITE_DOJO_SUPABASE_URL || fileEnv.VITE_DOJO_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || fileEnv.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('VITE_DOJO_SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY が必要です');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// 読み違えやすい文字（0/O, 1/l/I）を除いた12文字
function makePassword(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 12 }, () => chars[randomInt(chars.length)]).join('');
}

async function findByLoginId(loginId: string) {
  const { data, error } = await db
    .from('go_school_teachers')
    .select('id, login_id, display_name, active')
    .ilike('login_id', loginId.replace(/[\\%_]/g, '\\$&'))
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`ログインID「${loginId}」の講師はいません`);
  return data;
}

async function update(loginId: string, fields: Record<string, unknown>) {
  const row = await findByLoginId(loginId);
  const { error } = await db
    .from('go_school_teachers')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', row.id);
  if (error) throw error;
}

async function main() {
  const [cmd, a, b, c] = process.argv.slice(2);
  switch (cmd) {
    case 'list': {
      const { data, error } = await db
        .from('go_school_teachers')
        .select('login_id, display_name, active, created_at')
        .order('created_at');
      if (error) throw error;
      for (const t of data ?? []) {
        console.log(`${t.active ? '有効' : '停止'}\t${t.login_id}\t${t.display_name}`);
      }
      return;
    }
    case 'add': {
      if (!a || !b) throw new Error('使い方: add <ログインID> <表示名> [パスワード]');
      const password = c || makePassword();
      const { error } = await db.from('go_school_teachers').insert({
        login_id: a.trim(),
        display_name: b.trim(),
        password_hash: await hashTeacherPassword(password),
      });
      if (error) throw error;
      console.log(`登録しました: ${a} / ${b}`);
      if (!c) console.log(`パスワード: ${password}`);
      return;
    }
    case 'password': {
      if (!a) throw new Error('使い方: password <ログインID> [パスワード]');
      const password = b || makePassword();
      await update(a, { password_hash: await hashTeacherPassword(password) });
      console.log(`パスワードを変えました: ${a}`);
      if (!b) console.log(`パスワード: ${password}`);
      return;
    }
    case 'rename': {
      if (!a || !b) throw new Error('使い方: rename <ログインID> <表示名>');
      await update(a, { display_name: b.trim() });
      console.log(`表示名を変えました: ${a} → ${b}`);
      return;
    }
    case 'disable':
    case 'enable': {
      if (!a) throw new Error(`使い方: ${cmd} <ログインID>`);
      await update(a, { active: cmd === 'enable' });
      console.log(`${cmd === 'enable' ? '有効' : '停止'}にしました: ${a}`);
      return;
    }
    default:
      console.log('使い方: list | add | password | rename | disable | enable（先頭のコメント参照）');
  }
}

main().catch(err => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
