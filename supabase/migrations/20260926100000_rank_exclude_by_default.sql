-- 「ランクに入れない」を明示しなかった対局は数えない（2026-09-26）。
--
-- manage_game_action の create は必ず rating_excluded を明示して入れる。
-- 明示しない経路（古い版の関数・手作業の INSERT・試験）で作られた対局が、
-- 13路でも勝手にランクに数えられるのを防ぐ。数えるのは講師が対局作成で選んだものだけ。
ALTER TABLE public.go_school_live_games ALTER COLUMN rating_excluded SET DEFAULT true;
