-- ==========================================
-- 040: 学年(grade)を「手動上書き」運用に正規化
--
-- アプリ側で getDisplayGrade(student) = student.grade ?? calc(birthdate)
-- の運用に切り替えた。手動上書きが不要なケース（過去に手入力された値が
-- 現時点の自動計算値と一致する）は NULL に戻し、毎年4月の自動繰り上げを
-- 効かせる。birthdate 未入力 or 計算結果と grade が一致しない（留年・浪人・
-- 海外・データ古い等）ものは手動上書きとして温存する。
--
-- 安全策:
-- - 4/1基準で満年齢を計算（旧法342条準拠で4/1生まれは前年度扱い）
-- - 影響行を RAISE NOTICE で確認できるよう件数表示
-- - DRY-RUN で確認したい場合は BEGIN; ROLLBACK; で囲む
-- ==========================================

DO $$
DECLARE
  ref_date DATE := CURRENT_DATE;
  affected_count INTEGER;
BEGIN
  WITH calc AS (
    SELECT
      s.id,
      s.grade AS current_grade,
      s.birthdate,
      -- 学年年度開始日（4/1）
      CASE
        WHEN EXTRACT(MONTH FROM ref_date) >= 4
          THEN make_date(EXTRACT(YEAR FROM ref_date)::INT, 4, 1)
        ELSE make_date(EXTRACT(YEAR FROM ref_date)::INT - 1, 4, 1)
      END AS school_year_start
    FROM students s
    WHERE s.birthdate IS NOT NULL AND s.grade IS NOT NULL
  ), with_age AS (
    SELECT
      id,
      current_grade,
      birthdate,
      -- 4/1時点の満年齢
      EXTRACT(YEAR FROM age(school_year_start, birthdate))::INT AS age_at_apr1
    FROM calc
  ), with_calc_grade AS (
    SELECT
      id,
      current_grade,
      CASE
        WHEN age_at_apr1 < 3 THEN NULL
        WHEN age_at_apr1 = 3 THEN '年少'
        WHEN age_at_apr1 = 4 THEN '年中'
        WHEN age_at_apr1 = 5 THEN '年長'
        WHEN age_at_apr1 BETWEEN 6 AND 11 THEN '小' || (age_at_apr1 - 5)::TEXT
        WHEN age_at_apr1 BETWEEN 12 AND 14 THEN '中' || (age_at_apr1 - 11)::TEXT
        WHEN age_at_apr1 BETWEEN 15 AND 17 THEN '高' || (age_at_apr1 - 14)::TEXT
        ELSE '大人'
      END AS calc_grade
    FROM with_age
  )
  UPDATE students s
  SET grade = NULL
  FROM with_calc_grade c
  WHERE s.id = c.id
    AND c.current_grade = c.calc_grade;

  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RAISE NOTICE '040: % 件の grade を NULL 化しました（自動計算値と一致した行）', affected_count;
END $$;
