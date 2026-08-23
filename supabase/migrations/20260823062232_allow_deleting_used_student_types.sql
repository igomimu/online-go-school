-- Deleting a configured type now clears that profile field for affected
-- students, matching the UI's "未設定" choice.
CREATE OR REPLACE FUNCTION public.replace_go_school_student_types(p_entries jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  entry_count integer;
  distinct_count integer;
BEGIN
  IF auth.jwt()->>'app_role' IS DISTINCT FROM 'teacher' THEN
    RAISE EXCEPTION 'teacher access required' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(p_entries) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'p_entries must be an array' USING ERRCODE = '22023';
  END IF;

  SELECT count(*), count(DISTINCT btrim(entry.name))
  INTO entry_count, distinct_count
  FROM jsonb_to_recordset(p_entries) AS entry(original_name text, name text, position integer);

  IF entry_count = 0 THEN
    RAISE EXCEPTION 'at least one student type is required' USING ERRCODE = '22023';
  END IF;

  IF entry_count <> distinct_count OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_entries) AS entry(original_name text, name text, position integer)
    WHERE entry.name IS NULL OR btrim(entry.name) = '' OR entry.position IS NULL OR entry.position < 0
  ) THEN
    RAISE EXCEPTION 'student type names must be non-empty and unique' USING ERRCODE = '22023';
  END IF;

  UPDATE public.go_school_students AS student
  SET student_type = btrim(entry.name)
  FROM jsonb_to_recordset(p_entries) AS entry(original_name text, name text, position integer)
  WHERE entry.original_name IS NOT NULL
    AND entry.original_name <> btrim(entry.name)
    AND student.student_type = entry.original_name;

  UPDATE public.go_school_students AS student
  SET student_type = ''
  FROM public.go_school_student_types AS current_type
  WHERE student.student_type = current_type.name
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(p_entries) AS entry(original_name text, name text, position integer)
      WHERE entry.original_name = current_type.name
    );

  DELETE FROM public.go_school_student_types WHERE true;

  INSERT INTO public.go_school_student_types (name, display_order)
  SELECT btrim(entry.name), entry.position
  FROM jsonb_to_recordset(p_entries) AS entry(original_name text, name text, position integer)
  ORDER BY entry.position;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.replace_go_school_student_types(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_go_school_student_types(jsonb) TO authenticated, service_role;
