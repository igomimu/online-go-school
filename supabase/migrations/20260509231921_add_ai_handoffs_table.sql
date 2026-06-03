-- AIエージェント間ハンドオフ記録テーブル
-- 道場運営部・開発部・コンテンツ部・経営財務部・インフラ監視部の5部門が共通利用
-- くろん(MINIPC)とClaude Code(LEGION/YOGAPro)の両方がHTTP経由で読み書き可能

CREATE TABLE IF NOT EXISTS public.ai_handoffs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now() NOT NULL,
  department text NOT NULL,
  executor text NOT NULL,
  project text,
  title text NOT NULL,
  work_done text NOT NULL,
  output_summary text,
  next_steps text,
  check_requests text,
  status text DEFAULT 'pending' NOT NULL CHECK (status IN ('pending', 'checked', 'done')),
  checker text,
  checker_notes text,
  checked_at timestamptz
);

CREATE INDEX IF NOT EXISTS ai_handoffs_dept_created ON public.ai_handoffs (department, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_handoffs_status_created ON public.ai_handoffs (status, created_at DESC);

ALTER TABLE public.ai_handoffs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ai_handoffs' AND policyname = 'service_role_all'
  ) THEN
    EXECUTE 'CREATE POLICY service_role_all ON public.ai_handoffs TO service_role USING (true) WITH CHECK (true)';
  END IF;
END$$;

COMMENT ON TABLE public.ai_handoffs IS 'AIエージェント間のハンドオフ記録。全部門のAIが作業後に書き込み、チェック係が参照する。';
