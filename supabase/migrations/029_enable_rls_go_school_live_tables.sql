-- Harden legacy live game tables that exist on the remote project.
-- These tables are not used by the current dojo-app frontend, so the safest
-- default is to enable RLS and deny all non-service-role access until policies
-- are intentionally designed.

ALTER TABLE IF EXISTS public.go_school_live_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.go_school_live_moves ENABLE ROW LEVEL SECURITY;
