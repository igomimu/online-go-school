// 生徒ログイン情報のlocalStorage管理
import { getSupabase, functionsBaseUrl } from './liveGameApi';

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
// ログイン時に Anonymous Sign-In → validate_*_session → refreshSession の
// 3 ステップで Supabase 発行 JWT を確立する。Supabase Session が認可の primary
// （LiveKit 入室・対局の作成/着手すべてこの JWT が必須）のため、
// どのステップの失敗も ok:false で呼び出し元へ返し、ログインをブロックする。
// （旧・並行稼働期の「失敗しても ok:true」フォールバックは 2026-06-13 撤去）

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
    
    // 1. 匿名サインイン
    const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
    if (authError || !authData.session) {
      console.error('[Supabase Auth] Anonymous sign-in failed:', authError);
      return { ok: false, error: 'サーバーに接続できません（匿名サインイン失敗）' };
    }
    
    const token = authData.session.access_token;

    // 2. validate_student_session Edge Function の呼び出し
    const fnUrl = `${functionsBaseUrl()}/validate_student_session`;
    const res = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ studentId, classroomId }),
    });
    
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.error('[Supabase Auth] Student validation failed:', errBody.error || res.status);
      await supabase.auth.signOut().catch(() => {});
      return {
        ok: false,
        error: res.status === 403
          ? '生徒IDが確認できません。IDを確かめてください'
          : `生徒確認に失敗しました（${errBody.error || res.status}）`,
      };
    }
    
    const result = await res.json();
    
    // 3. セッションを更新して新しい JWT を取得 (メタデータ反映)
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      console.error('[Supabase Auth] Session refresh failed:', refreshError);
      return { ok: false, error: 'セッション更新に失敗しました。もう一度お試しください' };
    }
    
    return {
      ok: true,
      displayName: result.display_name || studentId,
    };
  } catch (err) {
    console.error('[Supabase Auth] Unexpected error in student sign-in:', err);
    return { ok: false, error: 'ログイン処理でエラーが発生しました' };
  }
}

export async function supabaseSignInTeacher(
  password: string,
  classroomId: string = 'global',
): Promise<SupabaseSessionResult> {
  try {
    const supabase = getSupabase();
    
    // 1. 匿名サインイン
    const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
    if (authError || !authData.session) {
      console.error('[Supabase Auth] Anonymous sign-in failed (teacher):', authError);
      return { ok: false, error: 'サーバーに接続できません（匿名サインイン失敗）' };
    }
    
    const token = authData.session.access_token;

    // 2. validate_teacher_session Edge Function の呼び出し
    const fnUrl = `${functionsBaseUrl()}/validate_teacher_session`;
    const res = await fetch(fnUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password, classroomId }),
    });
    
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      console.error('[Supabase Auth] Teacher validation failed:', errBody.error || res.status);
      await supabase.auth.signOut().catch(() => {});
      return {
        ok: false,
        error: res.status === 403
          ? 'パスワードがサーバーと一致しません'
          : `先生認証に失敗しました（${errBody.error || res.status}）`,
      };
    }
    
    // 3. セッションを更新して新しい JWT を取得 (メタデータ反映)
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      console.error('[Supabase Auth] Session refresh failed (teacher):', refreshError);
      return { ok: false, error: 'セッション更新に失敗しました。もう一度お試しください' };
    }

    return {
      ok: true,
      displayName: '先生',
    };
  } catch (err) {
    console.error('[Supabase Auth] Unexpected error in teacher sign-in:', err);
    return { ok: false, error: 'ログイン処理でエラーが発生しました' };
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
