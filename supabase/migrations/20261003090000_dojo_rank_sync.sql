-- 道場ランクを道場アプリ（students.rank = '16'）とネット道場（go_school_students.internal_rating = 'R16'）で
-- 双方向に同期する（2026-10-03 三村さん）
--
-- 決まり:
--   - どちらで直しても、もう一方へすぐ反映する（あとから書いた方が残る）。3連勝・3連敗の自動昇降も反映する
--   - 同期するのは数字のランクだけ。道場アプリの「5k」や R60 を超える値、空の値はもう一方へ送らない
--   - 生徒の対応は dojo_student_id。student_code は番号が重複していて使えない（1007 が別人どうし）ので、
--     名前（空白を除く）が道場アプリ側で1人だけに決まるときに結びつける
--   - 導入時にずれていた分はネット道場の値に揃える（三村さん「ネット道場が大抵正しい」）

ALTER TABLE public.go_school_students
  ADD COLUMN IF NOT EXISTS dojo_student_id uuid REFERENCES public.students(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS go_school_students_dojo_student_id_key
  ON public.go_school_students (dojo_student_id) WHERE dojo_student_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.normalize_student_name(name text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT replace(replace(coalesce(name, ''), ' ', ''), '　', '')
$$;

-- 名前で道場アプリの生徒を探して結びつける（未設定のときだけ）
CREATE OR REPLACE FUNCTION public.go_school_students_link_dojo()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  matched uuid[];
BEGIN
  IF NEW.dojo_student_id IS NULL AND public.normalize_student_name(NEW.name) <> '' THEN
    SELECT array_agg(s.id) INTO matched
      FROM public.students s
     WHERE public.normalize_student_name(s.name) = public.normalize_student_name(NEW.name);
    IF array_length(matched, 1) = 1 AND NOT EXISTS (
      SELECT 1 FROM public.go_school_students g
       WHERE g.dojo_student_id = matched[1] AND g.login_id <> NEW.login_id
    ) THEN
      NEW.dojo_student_id := matched[1];
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS go_school_students_link_dojo ON public.go_school_students;
CREATE TRIGGER go_school_students_link_dojo
  BEFORE INSERT OR UPDATE OF name, dojo_student_id ON public.go_school_students
  FOR EACH ROW EXECUTE FUNCTION public.go_school_students_link_dojo();

-- ネット道場 → 道場アプリ
CREATE OR REPLACE FUNCTION public.go_school_students_push_rank()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  dojo_rank text;
BEGIN
  IF NEW.dojo_student_id IS NULL OR NEW.internal_rating !~ '^R[0-9]+$' THEN
    RETURN NULL;
  END IF;
  dojo_rank := substr(NEW.internal_rating, 2)::int::text;
  -- 値が同じなら書かない（ここで止まるので、向こうのトリガーと往復しない）
  UPDATE public.students SET rank = dojo_rank
   WHERE id = NEW.dojo_student_id AND rank IS DISTINCT FROM dojo_rank;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS go_school_students_push_rank ON public.go_school_students;
CREATE TRIGGER go_school_students_push_rank
  AFTER INSERT OR UPDATE OF internal_rating, dojo_student_id ON public.go_school_students
  FOR EACH ROW EXECUTE FUNCTION public.go_school_students_push_rank();

-- 道場アプリ → ネット道場（数え始め rating_changed_at は既存トリガーが更新する＝手直しと同じ扱い）
CREATE OR REPLACE FUNCTION public.students_push_rank_to_go_school()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rating text;
BEGIN
  IF NEW.rank IS NULL OR NEW.rank !~ '^[0-9]+$' OR NEW.rank::int > 60 THEN
    RETURN NULL;
  END IF;
  rating := 'R' || NEW.rank::int;
  UPDATE public.go_school_students SET internal_rating = rating, updated_at = now()
   WHERE dojo_student_id = NEW.id AND internal_rating IS DISTINCT FROM rating;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS students_push_rank_to_go_school ON public.students;
CREATE TRIGGER students_push_rank_to_go_school
  AFTER UPDATE OF rank ON public.students
  FOR EACH ROW WHEN (NEW.rank IS DISTINCT FROM OLD.rank)
  EXECUTE FUNCTION public.students_push_rank_to_go_school();

-- 導入時: ネット道場側が空の生徒は、先に道場アプリの値を入れておく
UPDATE public.go_school_students g
   SET internal_rating = 'R' || s.rank::int, updated_at = now()
  FROM public.students s
 WHERE g.internal_rating = ''
   AND public.normalize_student_name(s.name) = public.normalize_student_name(g.name)
   AND s.rank ~ '^[0-9]+$' AND s.rank::int <= 60
   AND (SELECT count(*) FROM public.students s2
         WHERE public.normalize_student_name(s2.name) = public.normalize_student_name(g.name)) = 1;

-- 結びつける。push_rank トリガーがネット道場の値を道場アプリへ書く（ずれていた分はネット道場に揃う）
UPDATE public.go_school_students SET dojo_student_id = NULL WHERE dojo_student_id IS NULL;
