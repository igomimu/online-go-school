-- ==========================================
-- 038: 集中特訓の申込変更も自動返信対象にする
--
-- 036 では event_registrations の UPDATE は registered -> cancelled のみ通知していた。
-- update_training_registration は course / selected_dates を registered のまま更新するため、
-- 変更受付メールが送られない。変更差分も notify-event-registration に渡す。
-- ==========================================

CREATE OR REPLACE FUNCTION public.notify_event_registration_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  payload jsonb;
  jwt text;
BEGIN
  IF current_setting('app.suppress_notify', true) IS NOT DISTINCT FROM '1' THEN
    RETURN NEW;
  END IF;

  -- 発火条件:
  --   INSERT: registered の新規申込
  --   UPDATE: registered -> cancelled のキャンセル
  --   UPDATE: registered のまま course / selected_dates が変わった変更
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'registered' THEN RETURN NEW; END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'registered' AND NEW.status = 'cancelled' THEN
      NULL; -- cancel
    ELSIF OLD.status = 'registered'
       AND NEW.status = 'registered'
       AND (OLD.course IS DISTINCT FROM NEW.course
            OR OLD.selected_dates IS DISTINCT FROM NEW.selected_dates) THEN
      NULL; -- change
    ELSE
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  jwt := public._get_service_role_jwt();
  IF jwt IS NULL THEN
    RAISE WARNING 'service_role_jwt not in vault — skipping event_registration webhook';
    RETURN NEW;
  END IF;

  payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', row_to_json(NEW)::jsonb,
    'old_record', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD)::jsonb ELSE NULL END
  );

  PERFORM net.http_post(
    url := 'https://yzsyrtesydpulctjgdog.supabase.co/functions/v1/notify-event-registration',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || jwt
    ),
    body := payload
  );

  RETURN NEW;
END;
$$;
