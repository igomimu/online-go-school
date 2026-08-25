-- 整地の「確定」を双方の同意制にするための列。
-- 中身: 確定した対局者の色の配列（例 ["BLACK"]）。黒白が揃った時点で終局する。
-- 死石の指定が変わると空に戻す（古い盤面への同意を残さない）。
-- 書き込みは service_role 経由の Edge Function（manage_game_action）のみ。
-- 既存の SELECT ポリシーが `select *` のため、追加のRLS変更は不要。
ALTER TABLE public.go_school_live_games
    ADD COLUMN IF NOT EXISTS scoring_confirmed jsonb DEFAULT '[]'::jsonb;
