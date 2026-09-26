-- 詰碁格付けをブラウザごとの localStorage ではなく、生徒アカウント単位で保持する。
-- localStorage はオフライン時の表示キャッシュとして引き続き使う。

CREATE TABLE IF NOT EXISTS public.go_school_tsumego_ratings (
  student_login_id text PRIMARY KEY
    REFERENCES public.go_school_students(login_id) ON DELETE CASCADE,
  rank_id text NOT NULL,
  points smallint NOT NULL DEFAULT 0,
  consecutive_wins integer NOT NULL DEFAULT 0,
  protection_count smallint NOT NULL DEFAULT 0,
  total_solved integer NOT NULL DEFAULT 0,
  total_attempts integer NOT NULL DEFAULT 0,
  highest_rank_id text NOT NULL,
  last_updated timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT go_school_tsumego_ratings_rank_check
    CHECK (rank_id ~ '^(stone|bronze|silver|gold|diamond|light|legend)_[1-4]$'),
  CONSTRAINT go_school_tsumego_ratings_highest_rank_check
    CHECK (highest_rank_id ~ '^(stone|bronze|silver|gold|diamond|light|legend)_[1-4]$'),
  CONSTRAINT go_school_tsumego_ratings_points_check CHECK (points BETWEEN 0 AND 5),
  CONSTRAINT go_school_tsumego_ratings_protection_check CHECK (protection_count BETWEEN 0 AND 2),
  CONSTRAINT go_school_tsumego_ratings_counts_check CHECK (
    consecutive_wins >= 0 AND total_solved >= 0 AND total_attempts >= total_solved
  )
);

CREATE OR REPLACE FUNCTION public.keep_newest_go_school_tsumego_rating()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- 遅れて到着した古い保存要求で、新しい進捗を巻き戻さない。
  IF NEW.last_updated < OLD.last_updated THEN
    RETURN OLD;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS keep_newest_go_school_tsumego_rating
  ON public.go_school_tsumego_ratings;
CREATE TRIGGER keep_newest_go_school_tsumego_rating
  BEFORE UPDATE ON public.go_school_tsumego_ratings
  FOR EACH ROW EXECUTE FUNCTION public.keep_newest_go_school_tsumego_rating();

ALTER TABLE public.go_school_tsumego_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS go_school_tsumego_ratings_student_select
  ON public.go_school_tsumego_ratings;
CREATE POLICY go_school_tsumego_ratings_student_select
  ON public.go_school_tsumego_ratings FOR SELECT TO authenticated
  USING (
    auth.jwt()->>'app_role' = 'student'
    AND student_login_id = auth.jwt()->>'student_id'
  );

DROP POLICY IF EXISTS go_school_tsumego_ratings_student_insert
  ON public.go_school_tsumego_ratings;
CREATE POLICY go_school_tsumego_ratings_student_insert
  ON public.go_school_tsumego_ratings FOR INSERT TO authenticated
  WITH CHECK (
    auth.jwt()->>'app_role' = 'student'
    AND student_login_id = auth.jwt()->>'student_id'
  );

DROP POLICY IF EXISTS go_school_tsumego_ratings_student_update
  ON public.go_school_tsumego_ratings;
CREATE POLICY go_school_tsumego_ratings_student_update
  ON public.go_school_tsumego_ratings FOR UPDATE TO authenticated
  USING (
    auth.jwt()->>'app_role' = 'student'
    AND student_login_id = auth.jwt()->>'student_id'
  )
  WITH CHECK (
    auth.jwt()->>'app_role' = 'student'
    AND student_login_id = auth.jwt()->>'student_id'
  );

DROP POLICY IF EXISTS go_school_tsumego_ratings_teacher_select
  ON public.go_school_tsumego_ratings;
CREATE POLICY go_school_tsumego_ratings_teacher_select
  ON public.go_school_tsumego_ratings FOR SELECT TO authenticated
  USING (auth.jwt()->>'app_role' = 'teacher');

GRANT SELECT, INSERT, UPDATE ON public.go_school_tsumego_ratings TO authenticated;
GRANT ALL ON public.go_school_tsumego_ratings TO service_role;

COMMENT ON TABLE public.go_school_tsumego_ratings IS
  '三村囲碁オンラインの詰碁格付け。生徒ログインIDごとに端末をまたいで共有する。';
