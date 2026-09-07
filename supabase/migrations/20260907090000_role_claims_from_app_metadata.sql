-- ============================================================
-- 権限 claim の出どころを user_metadata から app_metadata へ移す
-- ============================================================
-- 2026-09-07 Codex レビュー #1 の対応。
--
-- これまで custom_access_token_hook は user_metadata（= auth.users.raw_user_meta_data）を
-- JWT claim へ昇格させていた。この欄は利用者自身が supabase.auth.updateUser({ data: ... })
-- で書き換えられるため、先生用パスワードの照合（validate_teacher_session）を通らずに
-- app_role='teacher' を名乗ることができた。claim は RLS（auth.jwt()->>'app_role'）と
-- Edge Functions / Vercel API の認可の両方で使われているので、そのまま権限昇格になる。
--
-- app_metadata（= auth.users.raw_app_meta_data）は service_role でしか書けない。
-- validate_teacher_session / validate_student_session を app_metadata へ書くよう変更し、
-- この Hook も app_metadata だけを見るようにする。
--
-- ⚠️ user_metadata への fallback は置かない。置くと穴がそのまま残る。
--    この migration を当てた時点で、既存セッションはトークン更新時に app_role を失う
--    （＝入り直しが必要）。ログインし直せば validate_* が app_metadata を書く。
-- ============================================================

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  app_meta jsonb;
  app_role text;
  classroom_id text;
  student_id text;
  teacher_id text;
begin
  claims := event->'claims';
  app_meta := claims->'app_metadata';

  if app_meta is not null then
    app_role := app_meta->>'app_role';
    classroom_id := app_meta->>'classroom_id';
    student_id := app_meta->>'student_id';
    teacher_id := app_meta->>'teacher_id';

    if app_role is not null then
      claims := jsonb_set(claims, '{app_role}', to_jsonb(app_role));
    end if;
    if classroom_id is not null then
      claims := jsonb_set(claims, '{classroom_id}', to_jsonb(classroom_id));
    end if;
    if student_id is not null then
      claims := jsonb_set(claims, '{student_id}', to_jsonb(student_id));
    end if;
    if teacher_id is not null then
      claims := jsonb_set(claims, '{teacher_id}', to_jsonb(teacher_id));
    end if;

    event := jsonb_set(event, '{claims}', claims);
  end if;

  return event;
end;
$$;

-- 権限: supabase_auth_admin だけが実行可能（元の migration と同じ）
grant usage on schema public to supabase_auth_admin;

grant execute on function public.custom_access_token_hook
  to supabase_auth_admin;

revoke execute on function public.custom_access_token_hook
  from authenticated, anon, public;
