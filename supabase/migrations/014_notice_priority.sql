-- お知らせの重要度（important: 通知あり, normal: アプリ内のみ）
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'important'
  CHECK (priority IN ('important', 'normal'));
