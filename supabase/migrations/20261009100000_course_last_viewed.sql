-- 視聴ページを最後に開いた日時（Systeme から移した購入者が新しいページを開いたかを確かめるため）
alter table public.course_purchases add column if not exists last_viewed_at timestamptz;
