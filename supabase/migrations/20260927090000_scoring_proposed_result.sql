-- 整地の確定で、先に確定した対局者の結果を控える（2026-09-27）。
--
-- これまでは最後に確定した側の結果をそのまま書いていたため、生徒が API を直接呼べば
-- 勝敗を書き換えられ、道場ランクの自動昇降（3連勝・3連敗）を操作できた。
-- manage_game_action の confirm_scoring は、生徒どうしの確定で
-- この控えと後から確定した側の結果が一致したときだけ終局させる。
--
-- 🔴 manage_game_action はこの列を読み書きするので、Edge Function の反映（main への push）
-- より先に本番DBへ適用すること。
ALTER TABLE public.go_school_live_games
  ADD COLUMN IF NOT EXISTS scoring_proposed_result text;
