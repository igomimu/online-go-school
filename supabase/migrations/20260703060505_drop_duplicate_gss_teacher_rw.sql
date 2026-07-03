-- 2026-07-03 Task 1 follow-up:
-- Remove the legacy duplicate teacher policy left from the 2026-06-30 roster work.
-- The canonical policy is go_school_students_teacher_all.
DROP POLICY IF EXISTS gss_teacher_rw ON public.go_school_students;
