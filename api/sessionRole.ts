// セッションの役割・所属の単一の真実（Vercel API 側）。
//
// 認可に使ってよいのは app_metadata だけ。user_metadata（auth.users.raw_user_meta_data）は
// 利用者自身が supabase.auth.updateUser({ data }) で書き換えられるため、そこを見ると
// 先生用パスワードの照合を通らずに teacher を名乗れてしまう（2026-09-07 Codex レビュー #1）。
//
// Edge Function 側の同じ判断は supabase/functions/_shared/sessionRole.ts にある。
// Deno と Node で実行環境が違うため二重管理（api/tokenAuth.ts と identity.ts と同じ扱い）。
// 片方を直したらもう片方も直すこと。

export interface SessionUserLike {
  app_metadata?: Record<string, unknown> | null;
  user_metadata?: Record<string, unknown> | null;
}

export interface SessionRole {
  /** 検証済みの役割。app_metadata に無ければ null（＝権限なし） */
  role: 'teacher' | 'student' | null;
  isTeacher: boolean;
  studentId: string | null;
  classroomId: string | null;
  teacherId: string | null;
  /** ゲストPWで入った先生。デモ教室に固定し、実データへ入れない */
  isGuest: boolean;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

export function readSessionRole(user: SessionUserLike | null | undefined): SessionRole {
  const meta = (user?.app_metadata ?? {}) as Record<string, unknown>;
  const rawRole = str(meta.app_role);
  const role = rawRole === 'teacher' || rawRole === 'student' ? rawRole : null;
  return {
    role,
    isTeacher: role === 'teacher',
    studentId: role === 'student' ? str(meta.student_id) : null,
    classroomId: str(meta.classroom_id),
    teacherId: role === 'teacher' ? str(meta.teacher_id) : null,
    isGuest: meta.is_guest === true,
  };
}
