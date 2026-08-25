-- 教室ごとの Cloudflare RealtimeKit ミーティングID。
--
-- LiveKit は部屋名を自由に決められたが（go-<教室ID> をそのまま使っていた）、
-- RealtimeKit のミーティングは作成時に UUID が振られるので、教室との対応を持つ必要がある。
-- 空のときは api/token.ts が作って書き戻す。
alter table public.go_school_classrooms
  add column if not exists realtime_meeting_id text;

comment on column public.go_school_classrooms.realtime_meeting_id is
  'Cloudflare RealtimeKit の meeting_id。未作成なら NULL（初回の入室時に作られる）';
