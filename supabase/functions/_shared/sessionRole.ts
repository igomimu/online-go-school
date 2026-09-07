// セッションの役割・所属の単一の真実。
//
// 認可に使ってよいのは app_metadata だけ。user_metadata（auth.users.raw_user_meta_data）は
// 利用者自身が supabase.auth.updateUser({ data }) で書き換えられるため、そこを見ると
// 先生用パスワードの照合（validate_teacher_session）を通らずに teacher を名乗れてしまう
// （2026-09-07 Codex レビュー #1）。app_metadata は service_role でしか書けない。
//
// Deno Edge Function と Deno テストの双方から import される純粋ロジック（外部依存なし）。
// Vercel API 側には同じ判断の Node 版が api/sessionRole.ts にある（identity.ts と
// api/tokenAuth.ts と同じ二重管理。片方を直したらもう片方も直す）。

export interface SessionUserLike {
  app_metadata?: Record<string, unknown> | null
  user_metadata?: Record<string, unknown> | null
}

export interface SessionRole {
  /** 検証済みの役割。app_metadata に無ければ null（＝権限なし） */
  role: 'teacher' | 'student' | null
  isTeacher: boolean
  studentId: string | null
  classroomId: string | null
  teacherId: string | null
  /** ゲストPWで入った先生。実データを見せずデモ教室へ固定する */
  isGuest: boolean
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null
}

export function readSessionRole(user: SessionUserLike | null | undefined): SessionRole {
  const meta = (user?.app_metadata ?? {}) as Record<string, unknown>
  const rawRole = str(meta.app_role)
  const role = rawRole === 'teacher' || rawRole === 'student' ? rawRole : null
  return {
    role,
    isTeacher: role === 'teacher',
    studentId: role === 'student' ? str(meta.student_id) : null,
    classroomId: str(meta.classroom_id),
    teacherId: role === 'teacher' ? str(meta.teacher_id) : null,
    isGuest: meta.is_guest === true,
  }
}
