-- ==========================================
-- 036: 全予約に自動返信を行うための通知トリガー
--
-- 哲学: 「予約があるのに来ない = システム側の落ち度」「不信感を植え付けない」。
-- 全ての予約操作（新規・キャンセル・変更）で保護者に自動返信を送る。
-- 失敗時は管理者に即アラート（Edge Function 側で実装）。
--
-- 同時に、既存の event_registrations 通知も:
--   - INSERT のみ → INSERT/UPDATE 両対応（キャンセル通知を実現）
--   - JWT ハードコード → vault.decrypted_secrets 経由で取得
--
-- 前提: vault に 'service_role_jwt' という名前で service_role JWT が登録済みであること。
--   登録は Management API or Studio SQL Editor で:
--     SELECT vault.create_secret($jwt$<JWT>$jwt$, 'service_role_jwt');
--
-- 重要なガード（admin保守SQLで誤通知を発生させないため）:
--   1. NEW.date >= CURRENT_DATE （過去・当日着分は飛ばさない）
--   2. current_setting('app.suppress_notify', true) <> '1' （admin保守SQLは
--        BEGIN; SET LOCAL app.suppress_notify='1'; ...操作...; COMMIT; で囲む）
--   3. UPDATE は status / class_id / date のいずれかが変わったときのみ発火
-- ==========================================

-- vault からシークレットを取り出すヘルパー
CREATE OR REPLACE FUNCTION public._get_service_role_jwt()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT decrypted_secret
    FROM vault.decrypted_secrets
    WHERE name = 'service_role_jwt'
    LIMIT 1
$$;

-- ===== reservations 用 webhook =====
CREATE OR REPLACE FUNCTION public.notify_reservation_webhook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  payload jsonb;
  jwt text;
BEGIN
  -- 集中特訓由来は notify-event-registration 側が処理
  IF NEW.event_registration_id IS NOT NULL THEN RETURN NEW; END IF;

  -- admin保守SQLは SET LOCAL app.suppress_notify='1' で囲む運用
  IF current_setting('app.suppress_notify', true) IS NOT DISTINCT FROM '1' THEN
    RETURN NEW;
  END IF;

  -- 過去日は通知しない（admin修復で過去予約を触っても保護者に飛ばない）
  IF NEW.date < CURRENT_DATE THEN RETURN NEW; END IF;

  -- 発火条件
  IF TG_OP = 'INSERT' THEN
    -- INSERT は status='confirmed' のみ
    IF NEW.status <> 'confirmed' THEN RETURN NEW; END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- status / class_id / date のいずれも変わらないなら飛ばさない
    IF OLD.status IS NOT DISTINCT FROM NEW.status
       AND OLD.class_id IS NOT DISTINCT FROM NEW.class_id
       AND OLD.date IS NOT DISTINCT FROM NEW.date THEN
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  jwt := public._get_service_role_jwt();
  IF jwt IS NULL THEN
    RAISE WARNING 'service_role_jwt not in vault — skipping reservation webhook';
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
    url := 'https://yzsyrtesydpulctjgdog.supabase.co/functions/v1/notify-reservation',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || jwt
    ),
    body := payload
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_reservation ON reservations;
CREATE TRIGGER trg_notify_reservation
  AFTER INSERT OR UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION notify_reservation_webhook();

-- ===== event_registrations 用 webhook =====
-- 既存関数を改修: vault化 + UPDATE 対応 + suppress_notify ガード
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

  -- 発火条件: INSERT は registered のみ、UPDATE は registered → cancelled のみ
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'registered' THEN RETURN NEW; END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NOT (OLD.status = 'registered' AND NEW.status = 'cancelled') THEN
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

-- 既存の AFTER INSERT トリガーを再作成して UPDATE もカバー
DROP TRIGGER IF EXISTS trg_notify_event_registration ON event_registrations;
CREATE TRIGGER trg_notify_event_registration
  AFTER INSERT OR UPDATE ON event_registrations
  FOR EACH ROW EXECUTE FUNCTION notify_event_registration_webhook();

DROP TRIGGER IF EXISTS trg_notify_external_event_registration ON external_event_registrations;
CREATE TRIGGER trg_notify_external_event_registration
  AFTER INSERT OR UPDATE ON external_event_registrations
  FOR EACH ROW EXECUTE FUNCTION notify_event_registration_webhook();
