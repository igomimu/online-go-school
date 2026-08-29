/**
 * 生徒に渡す「参加リンク」。
 *
 * 初めて使う大人（スポットネット生など）向けの導入を易しくするためのもので、
 * リンクを開くとログイン画面の生徒コードと教室が記入済みになる。生徒は
 * 「参加する」を押すだけでよく、4桁コードも教室IDも打たない。
 *
 * ⚠️ 自動ログインはしない（2026-08-30 三村さん）。ログイン画面は必ず見せる。
 *
 * 旧実装は `?role=STUDENT&room=go-<教室>` を付けてログインを飛ばして入室しようとしていたが、
 * その経路には Supabase セッションが無いので /api/token が 403 を返し、リンクは常に
 * 「接続に失敗しました」で終わっていた（2026-08-30 本番で実測）。
 */
export interface StudentLoginLinkParams {
  /** 教室ID（例: CLS20160919347） */
  classroomId: string;
  /** 生徒のログインコード（4桁） */
  studentCode: string;
  /** 基準URL。省略時は現在のページ */
  baseUrl?: string;
}

function currentBaseUrl(): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}${window.location.pathname}`;
}

/** 生徒コードと教室IDを記入済みにするログインリンクを作る */
export function buildStudentLoginLink({
  classroomId,
  studentCode,
  baseUrl,
}: StudentLoginLinkParams): string {
  const base = (baseUrl ?? currentBaseUrl()).replace(/\?.*$/, '');
  const params = new URLSearchParams();
  const code = (studentCode || '').trim();
  const classroom = (classroomId || '').trim();
  if (classroom) params.set('classroomId', classroom);
  if (code) params.set('code', code);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/**
 * URL から生徒コードを読む。`code` を正とし、旧リンクの `studentCode` / `studentId` も拾う。
 * 配ってしまった古いリンクを死なせないための後方互換。
 */
export function readStudentCodeFromParams(params: URLSearchParams): string | undefined {
  const raw = params.get('code') || params.get('studentCode') || params.get('studentId');
  const code = (raw || '').trim();
  return code || undefined;
}
