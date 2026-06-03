-- 041: 保護者ログイン時の自動親子紐付け + ウェルカムDM webhook
--
-- handle_new_user() を拡張し、parent_email が一致する students に
-- parent_profile_id を自動セットする。
-- さらに parent_profile_id が NULL→値に変わったタイミングで
-- send-welcome-dm Edge Function を呼ぶ。

-- ① handle_new_user() 拡張
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_role text;
BEGIN
  new_role := COALESCE(NEW.raw_user_meta_data->>'role', 'parent');

  INSERT INTO public.profiles (id, email, display_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'display_name',
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    new_role
  );

  -- parent のみ: parent_email が一致する生徒に自動紐付け
  IF new_role = 'parent' THEN
    UPDATE public.students
    SET parent_profile_id = NEW.id
    WHERE parent_email = NEW.email
      AND parent_profile_id IS NULL;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ② students.parent_profile_id が NULL→値になったとき send-welcome-dm を呼ぶ
CREATE OR REPLACE FUNCTION notify_student_parent_linked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  payload jsonb;
  jwt text;
BEGIN
  -- NULL → 値 のUPDATEのみ
  IF OLD.parent_profile_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.parent_profile_id IS NULL THEN RETURN NEW; END IF;

  jwt := public._get_service_role_jwt();
  IF jwt IS NULL THEN
    RAISE WARNING 'service_role_jwt not in vault — skipping welcome-dm webhook';
    RETURN NEW;
  END IF;

  payload := jsonb_build_object(
    'type',       TG_OP,
    'table',      TG_TABLE_NAME,
    'schema',     TG_TABLE_SCHEMA,
    'record',     row_to_json(NEW)::jsonb,
    'old_record', row_to_json(OLD)::jsonb
  );

  PERFORM net.http_post(
    url     := 'https://yzsyrtesydpulctjgdog.supabase.co/functions/v1/send-welcome-dm',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || jwt
    ),
    body    := payload
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_parent_linked ON students;
CREATE TRIGGER trg_student_parent_linked
  AFTER UPDATE OF parent_profile_id ON students
  FOR EACH ROW EXECUTE FUNCTION notify_student_parent_linked();
