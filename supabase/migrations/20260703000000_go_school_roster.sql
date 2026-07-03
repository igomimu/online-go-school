-- online-go-school roster authority.
-- Classrooms and the teacher-managed student roster live in Supabase; browser
-- localStorage is only a display cache and a one-time migration source.

CREATE TABLE IF NOT EXISTS public.go_school_classrooms (
  id text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  max_capacity integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT go_school_classrooms_max_capacity_check CHECK (max_capacity > 0)
);

CREATE TABLE IF NOT EXISTS public.go_school_students (
  login_id text PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  classroom_id text,
  classroom_position integer,
  rank text NOT NULL DEFAULT '',
  internal_rating text NOT NULL DEFAULT '',
  student_type text NOT NULL DEFAULT '',
  grade text NOT NULL DEFAULT '',
  country text NOT NULL DEFAULT '',
  birthdate date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.go_school_students ADD COLUMN IF NOT EXISTS classroom_id text;
ALTER TABLE public.go_school_students ADD COLUMN IF NOT EXISTS classroom_position integer;
ALTER TABLE public.go_school_students ADD COLUMN IF NOT EXISTS rank text NOT NULL DEFAULT '';
ALTER TABLE public.go_school_students ADD COLUMN IF NOT EXISTS internal_rating text NOT NULL DEFAULT '';
ALTER TABLE public.go_school_students ADD COLUMN IF NOT EXISTS student_type text NOT NULL DEFAULT '';
ALTER TABLE public.go_school_students ADD COLUMN IF NOT EXISTS grade text NOT NULL DEFAULT '';
ALTER TABLE public.go_school_students ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT '';
ALTER TABLE public.go_school_students ADD COLUMN IF NOT EXISTS birthdate date;
ALTER TABLE public.go_school_students ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.go_school_students ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'go_school_students_classroom_id_fkey'
  ) THEN
    ALTER TABLE public.go_school_students
      ADD CONSTRAINT go_school_students_classroom_id_fkey
      FOREIGN KEY (classroom_id)
      REFERENCES public.go_school_classrooms(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS go_school_students_classroom_position_idx
  ON public.go_school_students (classroom_id, classroom_position);

CREATE OR REPLACE FUNCTION public.set_go_school_roster_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_go_school_classrooms_updated_at ON public.go_school_classrooms;
CREATE TRIGGER set_go_school_classrooms_updated_at
  BEFORE UPDATE ON public.go_school_classrooms
  FOR EACH ROW
  EXECUTE FUNCTION public.set_go_school_roster_updated_at();

DROP TRIGGER IF EXISTS set_go_school_students_updated_at ON public.go_school_students;
CREATE TRIGGER set_go_school_students_updated_at
  BEFORE UPDATE ON public.go_school_students
  FOR EACH ROW
  EXECUTE FUNCTION public.set_go_school_roster_updated_at();

ALTER TABLE public.go_school_classrooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.go_school_students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS go_school_classrooms_teacher_all ON public.go_school_classrooms;
CREATE POLICY go_school_classrooms_teacher_all
  ON public.go_school_classrooms
  FOR ALL
  USING (auth.jwt()->>'app_role' = 'teacher')
  WITH CHECK (auth.jwt()->>'app_role' = 'teacher');

DROP POLICY IF EXISTS go_school_students_teacher_all ON public.go_school_students;
CREATE POLICY go_school_students_teacher_all
  ON public.go_school_students
  FOR ALL
  USING (auth.jwt()->>'app_role' = 'teacher')
  WITH CHECK (auth.jwt()->>'app_role' = 'teacher');

GRANT ALL ON TABLE public.go_school_classrooms TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.go_school_students TO anon, authenticated, service_role;
