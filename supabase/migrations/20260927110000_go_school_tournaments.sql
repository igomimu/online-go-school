-- 大会（トーナメント・リーグ戦）の保存先（2026-09-27）。
--
-- これまでは講師のブラウザの localStorage だけに置いていたため、別のPCでは大会が見えず、
-- ブラウザのデータを消すと大会ごと消えた。教室ごとに Supabase へ置く。
-- 中身（参加者・対戦表・結果）は画面の Tournament 型をそのまま data に入れる。
-- 読み書きするのは講師だけ（生徒の画面には大会を出していない）。
--
-- 🔴 アプリ（Vercel）の反映より先に本番DBへ適用すること。

CREATE TABLE IF NOT EXISTS public.go_school_tournaments (
  id text PRIMARY KEY,
  classroom_id text NOT NULL,
  data jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS go_school_tournaments_classroom_idx
  ON public.go_school_tournaments (classroom_id);

ALTER TABLE public.go_school_tournaments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS go_school_tournaments_teacher_all ON public.go_school_tournaments;
CREATE POLICY go_school_tournaments_teacher_all
  ON public.go_school_tournaments FOR ALL TO authenticated
  USING (auth.jwt() ->> 'app_role' = 'teacher')
  WITH CHECK (auth.jwt() ->> 'app_role' = 'teacher');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.go_school_tournaments TO authenticated;
GRANT ALL ON public.go_school_tournaments TO service_role;
