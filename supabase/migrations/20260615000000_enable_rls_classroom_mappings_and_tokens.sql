-- ---------- RLS 有効化: 6/3 に追加されたが取りこぼされていた2テーブル ----------
-- 背景: 20260603121500_add_classroom_mappings_and_tokens.sql で作成した
--   go_school_classroom_mappings / go_school_join_tokens は GRANT ALL TO anon,
--   authenticated のまま RLS 未有効だった。直後の 20260603130000_enable_rls_policies.sql
--   が live_games/live_moves/games だけを RLS 化し、この2テーブルを取りこぼしていた。
--   結果、anon/publishable 鍵で PostgREST 経由の直接読み書きが可能な状態
--   （Supabase security advisor: rls_disabled_in_public が ERROR 2件）。
--   特に go_school_join_tokens は student_id/classroom/expires_at を含み、
--   偽造トークンの INSERT すら許してしまう。
--
-- 方針: live_games/live_moves と同じく「書き込みは service_role(Edge) のみ」設計。
--   これら2テーブルにアクセスするのは api/token.ts のみで、そこは
--   SUPABASE_SERVICE_ROLE_KEY クライアント = RLS をバイパスする。フロントは
--   anon 鍵で直接触らない。したがって RLS を有効化しポリシーを一切作らないことで、
--   service_role 以外のすべての直接アクセスを完全に拒否する（deny-by-default）。

ALTER TABLE public.go_school_classroom_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.go_school_join_tokens ENABLE ROW LEVEL SECURITY;

-- ポリシーは意図的に作成しない。
-- RLS 有効 ＋ permissive ポリシー無し = anon/authenticated の SELECT/INSERT/UPDATE/DELETE
-- はすべて拒否される。service_role（api/token.ts）のみが読み書き可能。
