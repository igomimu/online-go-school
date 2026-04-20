-- ============================================================
-- Baseline migration: go_school_* テーブル群の現状スナップショット
-- ============================================================
-- 2026-04-20 時点で Supabase Dashboard 上に手動作成されていたスキーマを
-- migration として記録する。再実行可能（idempotent）。
--
-- 本番には既にこれらのテーブルが存在するため、通常 `supabase db push` で
-- 何も変わらない。ローカル環境の再現（`supabase db reset`）や
-- 別プロジェクトへの複製時に使用する。
--
-- RLS 状態の現状（Stage 7 で刷新予定）:
--   - go_school_games: RLS 有効、「Allow all for service role」ポリシーのみ（実質全許可）
--   - go_school_live_games: RLS 無効
--   - go_school_live_moves: RLS 無効
-- ============================================================

-- ---------- go_school_games（保存棋譜） ----------
CREATE TABLE IF NOT EXISTS public.go_school_games (
    id          text NOT NULL,
    date        text NOT NULL,
    black_player text NOT NULL,
    white_player text NOT NULL,
    board_size  integer NOT NULL,
    handicap    integer NOT NULL DEFAULT 0,
    komi        real NOT NULL DEFAULT 6.5,
    result      text NOT NULL,
    sgf         text NOT NULL,
    created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.go_school_games
    DROP CONSTRAINT IF EXISTS go_school_games_pkey;
ALTER TABLE public.go_school_games
    ADD CONSTRAINT go_school_games_pkey PRIMARY KEY (id);

ALTER TABLE public.go_school_games ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for service role" ON public.go_school_games;
CREATE POLICY "Allow all for service role"
    ON public.go_school_games
    USING (true)
    WITH CHECK (true);

GRANT ALL ON TABLE public.go_school_games TO anon, authenticated, service_role;


-- ---------- go_school_live_games（対局中/整地中/終局） ----------
CREATE TABLE IF NOT EXISTS public.go_school_live_games (
    id                  uuid NOT NULL DEFAULT gen_random_uuid(),
    classroom_id        text NOT NULL,
    black_player        text NOT NULL,
    white_player        text NOT NULL,
    board_size          integer NOT NULL DEFAULT 19,
    handicap            integer NOT NULL DEFAULT 0,
    komi                real NOT NULL DEFAULT 6.5,
    status              text NOT NULL DEFAULT 'playing',
    result              text,
    scoring_dead_stones jsonb DEFAULT '[]'::jsonb,
    clock               jsonb,
    created_at          timestamptz DEFAULT now(),
    updated_at          timestamptz DEFAULT now(),
    CONSTRAINT go_school_live_games_status_check
        CHECK (status IN ('playing', 'scoring', 'finished'))
);

ALTER TABLE public.go_school_live_games
    DROP CONSTRAINT IF EXISTS go_school_live_games_pkey;
ALTER TABLE public.go_school_live_games
    ADD CONSTRAINT go_school_live_games_pkey PRIMARY KEY (id);

CREATE INDEX IF NOT EXISTS go_school_live_games_classroom_status_idx
    ON public.go_school_live_games (classroom_id, status);

GRANT ALL ON TABLE public.go_school_live_games TO anon, authenticated, service_role;


-- ---------- go_school_live_moves（着手履歴） ----------
CREATE TABLE IF NOT EXISTS public.go_school_live_moves (
    game_id     uuid NOT NULL,
    move_number integer NOT NULL,
    x           integer NOT NULL,
    y           integer NOT NULL,
    color       text NOT NULL,
    player_id   text NOT NULL,
    created_at  timestamptz DEFAULT now(),
    CONSTRAINT go_school_live_moves_color_check
        CHECK (color IN ('BLACK', 'WHITE'))
);

ALTER TABLE public.go_school_live_moves
    DROP CONSTRAINT IF EXISTS go_school_live_moves_pkey;
ALTER TABLE public.go_school_live_moves
    ADD CONSTRAINT go_school_live_moves_pkey PRIMARY KEY (game_id, move_number);

ALTER TABLE public.go_school_live_moves
    DROP CONSTRAINT IF EXISTS go_school_live_moves_game_id_fkey;
ALTER TABLE public.go_school_live_moves
    ADD CONSTRAINT go_school_live_moves_game_id_fkey
    FOREIGN KEY (game_id) REFERENCES public.go_school_live_games(id)
    ON DELETE CASCADE;

GRANT ALL ON TABLE public.go_school_live_moves TO anon, authenticated, service_role;


-- ============================================================
-- Supabase Realtime publication
-- ============================================================
-- go_school_live_games / go_school_live_moves は Realtime 購読対象
-- （src/utils/liveGameApi.ts の subscribeLiveGame / subscribeClassroomGames）
-- 本番では supabase_realtime publication に登録済みと想定
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.go_school_live_games;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.go_school_live_moves;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END$$;
