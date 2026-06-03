-- 日本めぐりランキングは道場生（segment='internal'）のみを対象とする。
-- 未入会生徒（segment='external_event'）はイベント・出席簿だけに表示し、ランキングには含めない。
-- 道場では下の名前のひらがな（呼び名）で呼び合うので、共有・ランキング表示は呼び名（name_kana）。
DROP FUNCTION IF EXISTS public.get_japan_journey_ranking(text);

CREATE FUNCTION public.get_japan_journey_ranking(p_mode text)
RETURNS TABLE(
  student_id uuid,
  student_name text,
  student_kana text,
  student_segment text,
  cleared_count bigint,
  furthest_order bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    pp.student_id,
    COALESCE(s.name, 'なまえ未設定') AS student_name,
    s.name_kana AS student_kana,
    s.segment AS student_segment,
    COUNT(*)::BIGINT AS cleared_count,
    COUNT(*)::BIGINT AS furthest_order
  FROM public.prefecture_progress pp
  INNER JOIN public.students s ON s.id = pp.student_id
  WHERE pp.mode = p_mode
    AND pp.is_cleared = TRUE
    AND pp.student_id IS NOT NULL
    AND s.segment = 'internal'
  GROUP BY pp.student_id, s.name, s.name_kana, s.segment
  ORDER BY cleared_count DESC, student_name ASC;
$function$;
