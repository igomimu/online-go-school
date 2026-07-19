-- 「待った」機能（対局者どうしの同意制での一手取り消し）用の申請状態列。
-- 中身: { requested_by, requested_color, target_move_number, requested_at }
-- 書き込みは service_role 経由の Edge Function（manage_game_action）のみ。
-- 既存の SELECT ポリシー（20260603130000_enable_rls_policies.sql）が `select *` のため、
-- 追加のRLS変更は不要。
ALTER TABLE public.go_school_live_games
    ADD COLUMN IF NOT EXISTS undo_request jsonb;
