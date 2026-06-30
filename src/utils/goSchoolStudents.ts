// 三村囲碁オンライン 専用の生徒名簿（go_school_students）への読み書き。
// 道場アプリの students テーブルとは独立。先生が作成したログインコードで
// 生徒がログインできるよう、サーバー側に名簿を持たせる。
// 書き込みは先生セッション(app_role=teacher)で実行（RLSで許可）。
import { getSupabase } from './liveGameApi';

export async function upsertGoSchoolStudent(
  loginId: string,
  name: string,
  classroomId?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  const id = (loginId || '').trim();
  if (!id) return { ok: false, error: 'ログインコードが空です' };
  const supabase = getSupabase();
  const { error } = await supabase.from('go_school_students').upsert(
    {
      login_id: id,
      name: name || '',
      classroom_id: classroomId || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'login_id' },
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function deleteGoSchoolStudent(loginId: string): Promise<void> {
  const id = (loginId || '').trim();
  if (!id) return;
  const supabase = getSupabase();
  await supabase.from('go_school_students').delete().eq('login_id', id);
}
