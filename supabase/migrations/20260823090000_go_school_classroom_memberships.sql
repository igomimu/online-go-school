-- A student may attend more than one online classroom.
-- Keep profile data in go_school_students and move classroom membership/order
-- into a normalized join table.

CREATE TABLE IF NOT EXISTS public.go_school_classroom_memberships (
  classroom_id text NOT NULL
    REFERENCES public.go_school_classrooms(id) ON UPDATE CASCADE ON DELETE CASCADE,
  student_login_id text NOT NULL
    REFERENCES public.go_school_students(login_id) ON UPDATE CASCADE ON DELETE CASCADE,
  classroom_position integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (classroom_id, student_login_id)
);

-- The primary key covers classroom-first lookups. Student-first authentication
-- needs its own index (Postgres does not add one for the second FK column).
CREATE INDEX IF NOT EXISTS go_school_classroom_memberships_student_idx
  ON public.go_school_classroom_memberships (student_login_id, classroom_id);

-- Preserve every existing assignment during rollout.
INSERT INTO public.go_school_classroom_memberships (
  classroom_id,
  student_login_id,
  classroom_position
)
SELECT classroom_id, login_id, classroom_position
FROM public.go_school_students
WHERE classroom_id IS NOT NULL
ON CONFLICT (classroom_id, student_login_id) DO UPDATE
SET classroom_position = EXCLUDED.classroom_position,
    updated_at = now();

DROP TRIGGER IF EXISTS set_go_school_classroom_memberships_updated_at
  ON public.go_school_classroom_memberships;
CREATE TRIGGER set_go_school_classroom_memberships_updated_at
  BEFORE UPDATE ON public.go_school_classroom_memberships
  FOR EACH ROW
  EXECUTE FUNCTION public.set_go_school_roster_updated_at();

ALTER TABLE public.go_school_classroom_memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS go_school_classroom_memberships_teacher_all
  ON public.go_school_classroom_memberships;
CREATE POLICY go_school_classroom_memberships_teacher_all
  ON public.go_school_classroom_memberships
  FOR ALL
  TO authenticated
  USING ((SELECT auth.jwt()->>'app_role') = 'teacher')
  WITH CHECK ((SELECT auth.jwt()->>'app_role') = 'teacher');

GRANT ALL ON TABLE public.go_school_classroom_memberships
  TO authenticated, service_role;
REVOKE ALL ON TABLE public.go_school_classroom_memberships FROM anon;
