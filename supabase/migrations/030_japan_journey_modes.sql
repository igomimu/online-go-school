-- 030: 日本めぐりに難易度モードとランキングRPCを追加

ALTER TABLE public.prefecture_progress
  DROP CONSTRAINT IF EXISTS prefecture_progress_pkey;

ALTER TABLE public.prefecture_progress
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'easy';

CREATE UNIQUE INDEX IF NOT EXISTS idx_prefecture_progress_user_student_mode_prefecture
  ON public.prefecture_progress (
    user_id,
    COALESCE(student_id, '00000000-0000-0000-0000-000000000000'::uuid),
    mode,
    prefecture_id
  );

CREATE INDEX IF NOT EXISTS idx_prefecture_progress_mode
  ON public.prefecture_progress(mode);

CREATE OR REPLACE FUNCTION public.get_japan_journey_ranking(p_mode TEXT)
RETURNS TABLE (
  student_id UUID,
  student_name TEXT,
  cleared_count BIGINT,
  furthest_order BIGINT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pp.student_id,
    COALESCE(s.name, 'なまえ未設定') AS student_name,
    COUNT(*)::BIGINT AS cleared_count,
    COUNT(*)::BIGINT AS furthest_order
  FROM public.prefecture_progress pp
  LEFT JOIN public.students s ON s.id = pp.student_id
  WHERE pp.mode = p_mode
    AND pp.is_cleared = TRUE
    AND pp.student_id IS NOT NULL
  GROUP BY pp.student_id, s.name
  ORDER BY cleared_count DESC, student_name ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_japan_journey_ranking(TEXT) TO authenticated;
