-- 講師のアカウント（2026-10-12 三村さん「複数の講師を登録して、各自アカウントでログイン」）
--
-- これまで先生は全員が共通パスワード（Edge Function の TEACHER_PASSWORD_HASH）で入り、
-- 名前は各自の端末に手で入れていた。講師ごとにログインIDとパスワードを持たせ、
-- 表示名もここから引く。共通パスワードは移行のあいだ残す。
--
-- 読み書きは validate_teacher_session（service_role）と管理スクリプトだけ。
-- RLS を有効にしてポリシーを作らない＝anon / authenticated からは一切見えない。

create table if not exists public.go_school_teachers (
  id uuid primary key default gen_random_uuid(),
  login_id text not null,
  display_name text not null,
  -- pbkdf2_sha256$<回数>$<salt base64>$<hash base64>（_shared/teacherPassword.ts）
  password_hash text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists go_school_teachers_login_id_key
  on public.go_school_teachers (lower(login_id));

alter table public.go_school_teachers enable row level security;
revoke all on public.go_school_teachers from anon, authenticated;
