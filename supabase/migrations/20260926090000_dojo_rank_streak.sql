-- 道場ランク（R0が最強〜R60）の自動昇降（2026-09-26 三村さん）
--
-- 決まり:
--   - 3連勝で1つ上（R12→R11）、3連敗で1つ下（R12→R13）。R0 と R60 で止める
--   - 講師との対局: 生徒が勝てば数える。負けは数えない。ただし R0〜R4 の生徒は負けも数える
--   - 対局作成時に講師が「ランクに入れない」を選んだ対局は数えない
--   - 持碁は連続を切る。取消・中断など勝敗の無いものは数えない（連続も切らない）
--   - 連続は「最後にランクが変わってから」の対局で数える（講師が名簿で手直ししたときも数え直す）
--   - 時間切れ局を講師が再開したら、その対局で起きた変更を取り消す
--
-- 投了・時間切れ・整地のどの経路で終わっても status が finished になるので、
-- 判定はここ（トリガー）に一本化する。アプリ側に置くと経路ごとに書き漏れる。

ALTER TABLE public.go_school_live_games
  ADD COLUMN IF NOT EXISTS rating_excluded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz;

-- ランクが最後に変わった時刻。連続はここから数える。
-- 自動の昇降だけでなく、講師が名簿で手直ししたときもここから数え直す
ALTER TABLE public.go_school_students
  ADD COLUMN IF NOT EXISTS rating_changed_at timestamptz;

CREATE OR REPLACE FUNCTION public.go_school_students_stamp_rating()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.internal_rating IS DISTINCT FROM OLD.internal_rating
     AND NEW.rating_changed_at IS NOT DISTINCT FROM OLD.rating_changed_at THEN
    NEW.rating_changed_at := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS go_school_students_stamp_rating ON public.go_school_students;
CREATE TRIGGER go_school_students_stamp_rating
  BEFORE UPDATE OF internal_rating ON public.go_school_students
  FOR EACH ROW EXECUTE FUNCTION public.go_school_students_stamp_rating();

-- 導入前の対局は数えない。既存の行はすべて除外にしておく
UPDATE public.go_school_live_games SET rating_excluded = true WHERE rating_excluded = false;

CREATE TABLE IF NOT EXISTS public.go_school_rank_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  classroom_id text NOT NULL,
  login_id text NOT NULL,
  identity text NOT NULL,
  from_rating text NOT NULL,
  to_rating text NOT NULL,
  reason text NOT NULL CHECK (reason IN ('win_streak', 'loss_streak')),
  game_id uuid NOT NULL REFERENCES public.go_school_live_games(id) ON DELETE CASCADE,
  -- 取り消すとき、連続の数え始めも元に戻す（再開した対局がまた終わったら、前の2局と合わせて数えたい）
  previous_rating_changed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reverted_at timestamptz
);

CREATE INDEX IF NOT EXISTS go_school_rank_changes_student_idx
  ON public.go_school_rank_changes (classroom_id, login_id, created_at DESC);
CREATE INDEX IF NOT EXISTS go_school_rank_changes_game_idx
  ON public.go_school_rank_changes (game_id);

ALTER TABLE public.go_school_rank_changes ENABLE ROW LEVEL SECURITY;

-- 見え方は対局と同じ（講師は全部、生徒は自分の教室）。書くのはトリガーだけ
DROP POLICY IF EXISTS select_rank_changes ON public.go_school_rank_changes;
CREATE POLICY select_rank_changes ON public.go_school_rank_changes
  FOR SELECT USING (
    (auth.jwt() ->> 'app_role') = 'teacher'
    OR (auth.jwt() ->> 'classroom_id') = classroom_id
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'go_school_rank_changes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.go_school_rank_changes;
  END IF;
END $$;

-- ある対局が、その生徒にとって W（勝ち）/ L（負け）/ D（持碁）/ NULL（数えない）のどれか
CREATE OR REPLACE FUNCTION public.go_school_rank_outcome(
  p_result text,
  p_is_black boolean,
  p_vs_teacher boolean,
  p_rating integer
) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  m text[];
  outcome text;
BEGIN
  m := regexp_match(coalesce(trim(p_result), ''), '^([BW])\+(R|T|[0-9]+(?:\.[0-9]+)?)$', 'i');
  IF m IS NULL THEN
    RETURN NULL; -- 取消・中断・未記入
  END IF;
  IF m[2] ~ '^[0-9]' AND m[2]::numeric = 0 THEN
    RETURN 'D';
  END IF;
  outcome := CASE WHEN (upper(m[1]) = 'B') = p_is_black THEN 'W' ELSE 'L' END;
  -- 講師に負けたのは、R0〜R4 の生徒だけ数える
  IF p_vs_teacher AND outcome = 'L' AND p_rating > 4 THEN
    RETURN NULL;
  END IF;
  RETURN outcome;
END;
$$;

-- 終局した時刻を残す（連続を「最後にランクが変わってから」で数えるのに使う）
CREATE OR REPLACE FUNCTION public.go_school_live_games_stamp_finished()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'finished' AND OLD.status IS DISTINCT FROM 'finished' THEN
    NEW.finished_at := clock_timestamp(); -- now() は取引の開始時刻で、同じ取引の変更記録と同時刻になってしまう
  ELSIF NEW.status IS DISTINCT FROM 'finished' THEN
    NEW.finished_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS go_school_live_games_stamp_finished ON public.go_school_live_games;
CREATE TRIGGER go_school_live_games_stamp_finished
  BEFORE UPDATE OF status ON public.go_school_live_games
  FOR EACH ROW EXECUTE FUNCTION public.go_school_live_games_stamp_finished();

CREATE OR REPLACE FUNCTION public.go_school_apply_rank_streak()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  change record;
  player text;
  opponent text;
  login text;
  current_rating text;
  rating_num integer;
  last_change_at timestamptz;
  g record;
  first_outcome text;
  o text;
  streak integer;
  next_num integer;
BEGIN
  -- 時間切れ局の再開: この対局で起きた変更を取り消す（戻す先は変更前のランク）
  IF OLD.status = 'finished' AND NEW.status IS DISTINCT FROM 'finished' THEN
    FOR change IN
      SELECT * FROM go_school_rank_changes
      WHERE game_id = NEW.id AND reverted_at IS NULL
      ORDER BY created_at DESC
    LOOP
      UPDATE go_school_students
        SET internal_rating = change.from_rating,
            rating_changed_at = change.previous_rating_changed_at,
            updated_at = now()
        WHERE classroom_id = change.classroom_id
          AND login_id = change.login_id
          AND internal_rating = change.to_rating; -- 講師が手で直していたら触らない
      UPDATE go_school_rank_changes SET reverted_at = now() WHERE id = change.id;
    END LOOP;
    RETURN NEW;
  END IF;

  IF NOT (NEW.status = 'finished' AND OLD.status IS DISTINCT FROM 'finished') THEN
    RETURN NEW;
  END IF;
  IF NEW.rating_excluded THEN
    RETURN NEW;
  END IF;

  FOREACH player IN ARRAY ARRAY[NEW.black_player, NEW.white_player] LOOP
    CONTINUE WHEN player IS NULL OR player NOT LIKE 'sid:%';
    login := substring(player FROM 5);
    opponent := CASE WHEN player = NEW.black_player THEN NEW.white_player ELSE NEW.black_player END;

    SELECT internal_rating, rating_changed_at INTO current_rating, last_change_at
      FROM go_school_students
      WHERE classroom_id = NEW.classroom_id AND login_id = login
      FOR UPDATE;
    CONTINUE WHEN current_rating IS NULL OR current_rating !~ '^R[0-9]+$';
    rating_num := substring(current_rating FROM 2)::integer;

    first_outcome := NULL;
    streak := 0;
    FOR g IN
      SELECT result, black_player, white_player
      FROM go_school_live_games
      WHERE classroom_id = NEW.classroom_id
        AND (black_player = player OR white_player = player)
        AND status = 'finished'
        AND NOT rating_excluded
        AND finished_at IS NOT NULL
        AND (last_change_at IS NULL OR finished_at > last_change_at)
      ORDER BY finished_at DESC, id DESC
    LOOP
      o := go_school_rank_outcome(
        g.result,
        g.black_player = player,
        (CASE WHEN g.black_player = player THEN g.white_player ELSE g.black_player END) NOT LIKE 'sid:%',
        rating_num
      );
      CONTINUE WHEN o IS NULL;
      IF first_outcome IS NULL THEN
        first_outcome := o;
      ELSIF o <> first_outcome THEN
        EXIT;
      END IF;
      streak := streak + 1;
      EXIT WHEN streak >= 3;
    END LOOP;

    -- この対局そのものが数えないものなら、ここで変える理由は無い
    CONTINUE WHEN go_school_rank_outcome(NEW.result, NEW.black_player = player, opponent NOT LIKE 'sid:%', rating_num) IS NULL;
    CONTINUE WHEN streak < 3 OR first_outcome NOT IN ('W', 'L');

    next_num := CASE WHEN first_outcome = 'W' THEN greatest(rating_num - 1, 0) ELSE least(rating_num + 1, 60) END;
    CONTINUE WHEN next_num = rating_num;

    UPDATE go_school_students
      SET internal_rating = 'R' || next_num, rating_changed_at = clock_timestamp(), updated_at = now()
      WHERE classroom_id = NEW.classroom_id AND login_id = login;
    INSERT INTO go_school_rank_changes
        (classroom_id, login_id, identity, from_rating, to_rating, reason, game_id, previous_rating_changed_at)
      VALUES (NEW.classroom_id, login, player, current_rating, 'R' || next_num,
              CASE WHEN first_outcome = 'W' THEN 'win_streak' ELSE 'loss_streak' END, NEW.id, last_change_at);
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS go_school_apply_rank_streak ON public.go_school_live_games;
CREATE TRIGGER go_school_apply_rank_streak
  AFTER UPDATE OF status ON public.go_school_live_games
  FOR EACH ROW EXECUTE FUNCTION public.go_school_apply_rank_streak();
