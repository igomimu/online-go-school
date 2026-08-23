-- Student type names are shared across classrooms because a student can belong
-- to more than one classroom while student_type remains a profile attribute.
CREATE TABLE IF NOT EXISTS public.go_school_student_types (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL UNIQUE CHECK (name = btrim(name) AND name <> ''),
  display_order integer NOT NULL CHECK (display_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS go_school_student_types_display_order_idx
  ON public.go_school_student_types (display_order);

DROP TRIGGER IF EXISTS set_go_school_student_types_updated_at ON public.go_school_student_types;
CREATE TRIGGER set_go_school_student_types_updated_at
  BEFORE UPDATE ON public.go_school_student_types
  FOR EACH ROW
  EXECUTE FUNCTION public.set_go_school_roster_updated_at();

ALTER TABLE public.go_school_student_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS go_school_student_types_teacher_all ON public.go_school_student_types;
CREATE POLICY go_school_student_types_teacher_all
  ON public.go_school_student_types
  FOR ALL
  TO authenticated
  USING (auth.jwt()->>'app_role' = 'teacher')
  WITH CHECK (auth.jwt()->>'app_role' = 'teacher');

REVOKE ALL ON TABLE public.go_school_student_types FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.go_school_student_types TO authenticated;
GRANT ALL ON TABLE public.go_school_student_types TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.go_school_student_types_id_seq TO authenticated, service_role;

INSERT INTO public.go_school_student_types (name, display_order)
SELECT value, ordinality - 1
FROM unnest(ARRAY[
  'ネット生', '教室生', 'ネット教室生', '大人会員', '家族', '体験',
  'プロ志望', '元生徒', 'Jネット生', 'スポット', 'ネット道場生', '道場生'
]::text[]) WITH ORDINALITY AS defaults(value, ordinality)
ON CONFLICT (name) DO NOTHING;

-- Replace the ordered master and rename existing student profiles atomically.
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

  -- A category in use cannot disappear. A rename is represented by original_name.
  IF EXISTS (
    SELECT 1
    FROM public.go_school_students AS student
    JOIN public.go_school_student_types AS current_type ON current_type.name = student.student_type
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_to_recordset(p_entries) AS entry(original_name text, name text, position integer)
      WHERE entry.original_name = current_type.name
    )
  ) THEN
    RAISE EXCEPTION 'student type is currently in use' USING ERRCODE = '23503';
  END IF;

  UPDATE public.go_school_students AS student
  SET student_type = btrim(entry.name)
  FROM jsonb_to_recordset(p_entries) AS entry(original_name text, name text, position integer)
  WHERE entry.original_name IS NOT NULL
    AND entry.original_name <> btrim(entry.name)
    AND student.student_type = entry.original_name;

  DELETE FROM public.go_school_student_types;

  INSERT INTO public.go_school_student_types (name, display_order)
  SELECT btrim(entry.name), entry.position
  FROM jsonb_to_recordset(p_entries) AS entry(original_name text, name text, position integer)
  ORDER BY entry.position;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.replace_go_school_student_types(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_go_school_student_types(jsonb) TO authenticated, service_role;
