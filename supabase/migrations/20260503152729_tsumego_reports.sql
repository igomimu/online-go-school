-- ==========================================
-- tsumego_reports: 詰碁問題のまちがい報告
--
-- 背景: 道場アプリが詰碁問題の唯一の利用先。生徒が「これおかしい」と
-- 気づいた時にワンタップで報告 → 管理者にメール → sumatsume で編集 →
-- migrate-problems.mjs で同期、というフローを構築する。
--
-- 通知: notify-tsumego-report Edge Function 経由でメール（dojo@1kawa15.com）。
-- 既存 notify-* と同じく vault('service_role_jwt') + pg_net パターン。
-- ==========================================

CREATE TABLE IF NOT EXISTS public.tsumego_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  problem_id uuid NOT NULL REFERENCES public.tsumego_problems(id) ON DELETE CASCADE,
  source_id integer NOT NULL,  -- sumatsume検索用に冗長保存（problem削除時のために独立）
  reporter_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fixed', 'wontfix')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_tsumego_reports_status ON public.tsumego_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tsumego_reports_problem ON public.tsumego_reports(problem_id);

ALTER TABLE public.tsumego_reports ENABLE ROW LEVEL SECURITY;

-- 認証済みユーザーは誰でも報告できる
DROP POLICY IF EXISTS tsumego_reports_insert ON public.tsumego_reports;
CREATE POLICY tsumego_reports_insert ON public.tsumego_reports
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = reporter_id OR reporter_id IS NULL);

-- 自分の報告は閲覧可能
DROP POLICY IF EXISTS tsumego_reports_select_own ON public.tsumego_reports;
CREATE POLICY tsumego_reports_select_own ON public.tsumego_reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid());

-- admin/staff は全件閲覧・更新
DROP POLICY IF EXISTS tsumego_reports_select_staff ON public.tsumego_reports;
CREATE POLICY tsumego_reports_select_staff ON public.tsumego_reports
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'staff')
  ));

DROP POLICY IF EXISTS tsumego_reports_update_staff ON public.tsumego_reports;
CREATE POLICY tsumego_reports_update_staff ON public.tsumego_reports
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'staff')
  ));

-- ===== webhook trigger =====
CREATE OR REPLACE FUNCTION public.notify_tsumego_report_webhook()
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

  -- INSERT のみ通知（UPDATE はステータス変更のみで通知不要）
  IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;

  jwt := public._get_service_role_jwt();
  IF jwt IS NULL THEN
    RAISE WARNING 'service_role_jwt not in vault — skipping tsumego_report webhook';
    RETURN NEW;
  END IF;

  payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'schema', TG_TABLE_SCHEMA,
    'record', row_to_json(NEW)::jsonb,
    'old_record', NULL
  );

  PERFORM net.http_post(
    url := 'https://yzsyrtesydpulctjgdog.supabase.co/functions/v1/notify-tsumego-report',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || jwt
    ),
    body := payload
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_tsumego_report ON public.tsumego_reports;
CREATE TRIGGER trg_notify_tsumego_report
  AFTER INSERT ON public.tsumego_reports
  FOR EACH ROW EXECUTE FUNCTION public.notify_tsumego_report_webhook();
