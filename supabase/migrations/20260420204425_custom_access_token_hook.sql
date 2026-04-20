-- ============================================================
-- Custom Access Token Hook: online-go-school のセッション発行
-- ============================================================
-- Phase 0 Stage 2 の設計方針 pivot 後の実装。
--
-- フロント側で supabase.auth.signInAnonymously({ options: { data: {
--   student_id, classroom_id, app_role: 'student' | 'teacher'
-- } } }) を呼ぶと、渡した data は auth.users.raw_user_meta_data に
-- 保存され、JWT 発行時に event.claims.user_metadata として Hook に渡る。
--
-- この Hook で user_metadata の中身を JWT claim のトップレベルに昇格させ、
-- Stage 7 で設定予定の RLS (auth.jwt()->>'classroom_id' 等) から参照できるようにする。
--
-- Supabase 側の鍵で署名されるため、アプリ側は JWT_SECRET を一切保持しない。
--
-- Hook の有効化は Management API で別途実施（migration とは別管理）:
--   PATCH /v1/projects/{ref}/config/auth
--   {
--     "hook_custom_access_token_enabled": true,
--     "hook_custom_access_token_uri": "pg-functions://postgres/public/custom_access_token_hook"
--   }
-- ============================================================

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  claims jsonb;
  user_meta jsonb;
  app_role text;
  classroom_id text;
  student_id text;
  teacher_id text;
begin
  claims := event->'claims';
  user_meta := claims->'user_metadata';

  if user_meta is not null then
    app_role := user_meta->>'app_role';
    classroom_id := user_meta->>'classroom_id';
    student_id := user_meta->>'student_id';
    teacher_id := user_meta->>'teacher_id';

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

-- ------------------------------------------------------------
-- 権限: supabase_auth_admin だけが実行可能にする
-- ------------------------------------------------------------
grant usage on schema public to supabase_auth_admin;

grant execute on function public.custom_access_token_hook
  to supabase_auth_admin;

revoke execute on function public.custom_access_token_hook
  from authenticated, anon, public;
