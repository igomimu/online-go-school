// 生徒ログイン情報のlocalStorage管理
import { getSupabase } from './liveGameApi';

const ACCOUNTS_KEY = 'go-school-accounts';
const TEACHER_PW_KEY = 'go-school-teacher-pw';

export interface SavedAccount {
  studentId: string;
  classroomId: string;
  studentName: string; // 先生側で解決された名前（初回は空）
  classroomName: string;
  lastUsed: number; // Date.now()
}

// === 生徒アカウント ===

export function loadAccounts(): SavedAccount[] {
  try {
    const data = localStorage.getItem(ACCOUNTS_KEY);
    if (!data) return [];
    return (JSON.parse(data) as SavedAccount[]).sort((a, b) => b.lastUsed - a.lastUsed);
  } catch {
    return [];
  }
}

/** upsert: 同じstudentId+classroomIdがあれば更新、なければ追加 */
export function saveAccount(
  studentId: string,
  classroomId: string,
  studentName: string = '',
  classroomName: string = '',
): void {
  const accounts = loadAccounts();
  const idx = accounts.findIndex(
    a => a.studentId === studentId && a.classroomId === classroomId,
  );
  const entry: SavedAccount = {
    studentId,
    classroomId,
    studentName: studentName || accounts[idx]?.studentName || '',
    classroomName: classroomName || accounts[idx]?.classroomName || '',
    lastUsed: Date.now(),
  };
  if (idx >= 0) {
    accounts[idx] = entry;
  } else {
    accounts.push(entry);
  }
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function deleteAccount(studentId: string, classroomId: string): void {
  const accounts = loadAccounts().filter(
    a => !(a.studentId === studentId && a.classroomId === classroomId),
  );
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

/** 最後に使ったアカウント */
export function loadLastAccount(): SavedAccount | null {
  const accounts = loadAccounts();
  return accounts.length > 0 ? accounts[0] : null;
}

// === 先生パスワード ===

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function hasTeacherPassword(): boolean {
  return !!localStorage.getItem(TEACHER_PW_KEY);
}

export async function setTeacherPassword(password: string): Promise<void> {
  localStorage.setItem(TEACHER_PW_KEY, await sha256(password));
}

export async function verifyTeacherPassword(password: string): Promise<boolean> {
  const stored = localStorage.getItem(TEACHER_PW_KEY);
  if (!stored) return false;
  return stored === await sha256(password);
}

export function resetTeacherPassword(): void {
  localStorage.removeItem(TEACHER_PW_KEY);
}

// === Supabase Session 連携（Phase 0 Stage 2〜）===
//
// 生徒ログイン時に Anonymous Sign-In → validate_student_session → refreshSession の
// 3 ステップで Supabase 発行 JWT を確立する。既存の localStorage 認証と並行稼働し、
// 本番の Hook / Anonymous Sign-In が OFF でもフロントは壊れない（並行稼働期間中は
// 失敗を警告ログに留め、localStorage 経路でセッションを維持）。
//
// Stage 8 で service_role key → publishable key 切替後、Supabase Session が primary
// になる。それまでは補助的な位置付け。

export interface SupabaseSessionResult {
  ok: boolean;
  error?: string;
  displayName?: string;
}

export async function supabaseSignInStudent(
  studentId: string,
  classroomId: string,
): Promise<SupabaseSessionResult> {
  try {
    const supabase = getSupabase();
    // 既存 session がある場合はログアウトしてクリーンに開始
    await supabase.auth.signOut().catch(() => {});

    const { data: signInData, error: signInError } = await supabase.auth.signInAnonymously();
    if (signInError || !signInData?.session) {
      return { ok: false, error: `anonymous sign-in failed: ${signInError?.message ?? 'no session'}` };
    }

    const { data: validateData, error: validateError } = await supabase.functions.invoke(
      'validate_student_session',
      { body: { studentId, classroomId } },
    );
    if (validateError) {
      return { ok: false, error: `validate failed: ${validateError.message}` };
    }
    if (!validateData?.ok) {
      return { ok: false, error: `validate rejected: ${JSON.stringify(validateData)}` };
    }

    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      return { ok: false, error: `refresh failed: ${refreshError.message}` };
    }

    return { ok: true, displayName: validateData.display_name };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function supabaseSignOut(): Promise<void> {
  try {
    const supabase = getSupabase();
    await supabase.auth.signOut();
  } catch {
    // 失敗しても致命ではない
  }
}

export async function getSupabaseSessionClaims(): Promise<Record<string, unknown> | null> {
  try {
    const supabase = getSupabase();
    const { data } = await supabase.auth.getSession();
    if (!data.session) return null;
    const parts = data.session.access_token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload as Record<string, unknown>;
  } catch {
    return null;
  }
}
