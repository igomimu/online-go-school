-- 正式運用前のテストで5ptでは昇格が早すぎたため、昇格条件を50ptへ変更する。
-- アプリを先に公開すると6pt到達時の保存が旧制約で失敗するため、必ずこのmigrationを先に適用する。

-- 本番DBでは制約だけが先に手動適用され、migration履歴にはこの版が残っていない。
-- 後から履歴を揃えるために再実行しても、利用者の進捗データは変更しない。

ALTER TABLE public.go_school_tsumego_ratings
  DROP CONSTRAINT IF EXISTS go_school_tsumego_ratings_points_check;

ALTER TABLE public.go_school_tsumego_ratings
  ADD CONSTRAINT go_school_tsumego_ratings_points_check
  CHECK (points BETWEEN 0 AND 50);
