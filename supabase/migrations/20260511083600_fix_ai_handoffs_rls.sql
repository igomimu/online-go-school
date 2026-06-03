-- ai_handoffs RLS 不備修正 (2026-05-11)
--
-- 旧 migration 20260509231921 の policy `service_role_all` が
--   CREATE POLICY ... USING (true) WITH CHECK (true)
-- のように TO 句を欠いていたため、デフォルトの TO public が適用され、
-- anon / authenticated を含む全 role が ai_handoffs を読み書きできていた。
--
-- 本番DBには 2026-05-11 17:36 JST に Management API 経由で先行適用済 (動作確認: anon SELECT が空配列、anon INSERT が 42501)。
-- 本migrationは履歴保全と新規 DB セットアップ用。
--
-- 方針: ポリシーを drop するだけ。service_role は BYPASSRLS 属性を持つため、
--      RLS 有効 + policy 0個 = service_role のみアクセス可、で要件達成。

DROP POLICY IF EXISTS service_role_all ON public.ai_handoffs;
