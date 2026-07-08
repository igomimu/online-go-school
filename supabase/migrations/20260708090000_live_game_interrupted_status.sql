ALTER TABLE public.go_school_live_games
    DROP CONSTRAINT IF EXISTS go_school_live_games_status_check;

ALTER TABLE public.go_school_live_games
    ADD CONSTRAINT go_school_live_games_status_check
    CHECK (status IN ('playing', 'scoring', 'finished', 'interrupted'));
