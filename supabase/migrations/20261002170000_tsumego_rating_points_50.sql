-- 正式運用前のテストで5ptでは昇格が早すぎたため、昇格条件を50ptへ変更する。
-- アプリを先に公開すると6pt到達時の保存が旧制約で失敗するため、必ずこのmigrationを先に適用する。

-- 2026-10-03の正式開始前に解いたテスターの進捗だけを未開始へ戻す。
-- 0問の初期設定行と、正式開始後の進捗は削除しない。
DELETE FROM public.go_school_tsumego_ratings
WHERE total_attempts > 0
  AND last_updated < TIMESTAMPTZ '2026-10-03 00:00:00+09';

ALTER TABLE public.go_school_tsumego_ratings
  DROP CONSTRAINT IF EXISTS go_school_tsumego_ratings_points_check;

ALTER TABLE public.go_school_tsumego_ratings
  ADD CONSTRAINT go_school_tsumego_ratings_points_check
  CHECK (points BETWEEN 0 AND 50);
