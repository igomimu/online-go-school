-- 詰碁格付けの計算をサーバーで行う（2026-09-27）。
--
-- これまでは生徒の端末が計算した格付けをそのまま upsert していたため、
--   - 生徒が API を直接呼べば好きな格（伝説の棋士Ⅰなど）を書き込めた
--   - 「新しい方を採る」判定が端末の時計（last_updated）頼みで、時計が遅れた端末の保存は黙って捨てられた
--   - 新しい端末で初期格を選ぶと、アカウントに保存済みの格を上書きできた
-- 生徒の直接書き込みをやめ、次の関数だけを通す。
--   go_school_tsumego_start(rank_id)   初期格を決める。すでに格があれば何も変えずにそれを返す
--   go_school_tsumego_record(correct)  1問ぶんの結果を反映した格を返す（src/utils/tsumegoRating.ts と同じ規則）
--   go_school_tsumego_reset(login_id)  講師が生徒の格付けを消す（生徒は次の出題で初期格を選び直す）
--
-- 🔴 アプリ（Vercel）の反映より先に本番DBへ適用すること。

-- 下から上への28段階（src/utils/tsumegoRating.ts の TSUMEGO_RANKS と同じ順）
CREATE OR REPLACE FUNCTION public.go_school_tsumego_rank_ids()
RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$
  SELECT ARRAY[
    'stone_4','stone_3','stone_2','stone_1',
    'bronze_4','bronze_3','bronze_2','bronze_1',
    'silver_4','silver_3','silver_2','silver_1',
    'gold_4','gold_3','gold_2','gold_1',
    'diamond_4','diamond_3','diamond_2','diamond_1',
    'light_4','light_3','light_2','light_1',
    'legend_4','legend_3','legend_2','legend_1'
  ]::text[];
$$;

-- 生徒の直接書き込みをやめる（読み取りは今までどおり）
DROP POLICY IF EXISTS go_school_tsumego_ratings_student_insert ON public.go_school_tsumego_ratings;
DROP POLICY IF EXISTS go_school_tsumego_ratings_student_update ON public.go_school_tsumego_ratings;
REVOKE INSERT, UPDATE, DELETE ON public.go_school_tsumego_ratings FROM authenticated;

-- 端末の時計で新旧を決めるトリガーは使わない（書き込みはすべて下の関数がサーバー時刻で行う）
DROP TRIGGER IF EXISTS keep_newest_go_school_tsumego_rating ON public.go_school_tsumego_ratings;
DROP FUNCTION IF EXISTS public.keep_newest_go_school_tsumego_rating();

CREATE OR REPLACE FUNCTION public.go_school_tsumego_start(p_rank_id text)
RETURNS public.go_school_tsumego_ratings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_login text := auth.jwt() ->> 'student_id';
  v_row go_school_tsumego_ratings;
BEGIN
  IF coalesce(auth.jwt() ->> 'app_role', '') <> 'student' OR coalesce(v_login, '') = '' THEN
    RAISE EXCEPTION 'only students can start a tsumego rating' USING ERRCODE = '42501';
  END IF;
  -- 初期格として選べるのは各区分のⅣだけ（TsumegoInitialRankDialog の選択肢）
  IF p_rank_id IS NULL OR p_rank_id !~ '^(stone|bronze|silver|gold|diamond|light|legend)_4$' THEN
    RAISE EXCEPTION 'invalid initial rank: %', p_rank_id USING ERRCODE = '22023';
  END IF;

  INSERT INTO go_school_tsumego_ratings
      (student_login_id, rank_id, points, consecutive_wins, protection_count,
       total_solved, total_attempts, highest_rank_id, last_updated, updated_at)
    VALUES (v_login, p_rank_id, 0, 0, 0, 0, 0, p_rank_id, now(), now())
    ON CONFLICT (student_login_id) DO NOTHING;

  -- すでに格があった（別の端末で決めていた）ときは、それをそのまま返す
  SELECT * INTO v_row FROM go_school_tsumego_ratings WHERE student_login_id = v_login;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.go_school_tsumego_record(p_is_correct boolean)
RETURNS public.go_school_tsumego_ratings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_login text := auth.jwt() ->> 'student_id';
  v_ranks text[] := go_school_tsumego_rank_ids();
  v_row go_school_tsumego_ratings;
  v_idx integer;
  v_points integer;
  v_prot integer;
  v_wins integer;
  v_highest integer;
BEGIN
  IF coalesce(auth.jwt() ->> 'app_role', '') <> 'student' OR coalesce(v_login, '') = '' THEN
    RAISE EXCEPTION 'only students can record tsumego results' USING ERRCODE = '42501';
  END IF;
  IF p_is_correct IS NULL THEN
    RAISE EXCEPTION 'result is required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_row FROM go_school_tsumego_ratings WHERE student_login_id = v_login FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tsumego rating not started' USING ERRCODE = 'P0002';
  END IF;

  v_idx := array_position(v_ranks, v_row.rank_id);   -- 1始まり
  v_points := v_row.points;
  v_prot := v_row.protection_count;
  v_wins := v_row.consecutive_wins;

  IF p_is_correct THEN
    v_wins := v_wins + 1;
    v_points := v_points + 1;
    IF v_points >= 5 THEN
      IF v_idx < array_length(v_ranks, 1) THEN
        v_idx := v_idx + 1;      -- 昇格
        v_points := 0;
        v_prot := 2;             -- 昇格直後の2回は、まちがえても勝ち点が減らない
      ELSE
        v_points := 5;           -- 最上位はそこで止める
      END IF;
    END IF;
  ELSE
    v_wins := 0;
    IF v_prot > 0 THEN
      v_prot := v_prot - 1;
    ELSIF v_points > 0 THEN
      v_points := v_points - 1;
    ELSIF v_idx > 4 THEN         -- 石ころ棋士（1〜4番目）は降格しない
      v_idx := v_idx - 1;        -- 降格。あと1問で戻れる位置に置く
      v_points := 4;
    END IF;
  END IF;

  v_highest := greatest(v_idx, array_position(v_ranks, v_row.highest_rank_id));

  UPDATE go_school_tsumego_ratings
    SET rank_id = v_ranks[v_idx],
        points = v_points,
        consecutive_wins = v_wins,
        protection_count = v_prot,
        total_solved = total_solved + (CASE WHEN p_is_correct THEN 1 ELSE 0 END),
        total_attempts = total_attempts + 1,
        highest_rank_id = v_ranks[v_highest],
        last_updated = now(),
        updated_at = now()
    WHERE student_login_id = v_login
    RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.go_school_tsumego_reset(p_login_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(auth.jwt() ->> 'app_role', '') <> 'teacher' THEN
    RAISE EXCEPTION 'only teachers can reset tsumego ratings' USING ERRCODE = '42501';
  END IF;
  DELETE FROM go_school_tsumego_ratings WHERE student_login_id = p_login_id;
END;
$$;

REVOKE ALL ON FUNCTION public.go_school_tsumego_start(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.go_school_tsumego_record(boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.go_school_tsumego_reset(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.go_school_tsumego_start(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.go_school_tsumego_record(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.go_school_tsumego_reset(text) TO authenticated;
