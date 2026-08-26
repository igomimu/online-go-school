-- 先生がその教室に入っているか。
--
-- これまでは映像基盤（LiveKit / RealtimeKit）に問い合わせて確かめていたが、
-- RealtimeKit は先生が繋いでからセッションが見えるまで約10秒かかる。
-- その間 生徒は「先生がまだ教室を開いていません」と言われて待たされ、
-- 先生は既に居るのに来ていないと誤解される（2026-08-26 実授業）。
--
-- 先生が入った時点でここに時刻を書き、生徒の門番はこれを見る。
-- 定期的に上書きされ、途切れたら一定時間で「居ない」に戻る。
alter table public.go_school_classrooms
  add column if not exists teacher_present_at timestamptz;

comment on column public.go_school_classrooms.teacher_present_at is
  '先生が最後に在室を知らせた時刻。これが新しければ教室が開いていると見なす（NULL は不在）';
