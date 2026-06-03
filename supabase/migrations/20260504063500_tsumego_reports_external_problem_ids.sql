-- tsumego_reports stores problem IDs from the shared sumatsume problem DB.
-- dojo-app keeps progress/reporting tables locally, so report.problem_id must
-- not reference dojo-app public.tsumego_problems.

ALTER TABLE public.tsumego_reports
  DROP CONSTRAINT IF EXISTS tsumego_reports_problem_id_fkey;

COMMENT ON COLUMN public.tsumego_reports.problem_id IS
  'Problem UUID from the shared sumatsume tsumego_problems table. Not a local FK.';
