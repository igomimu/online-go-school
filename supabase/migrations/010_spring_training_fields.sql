-- event_registrations に集中特訓用フィールドを追加
ALTER TABLE event_registrations
  ADD COLUMN IF NOT EXISTS course TEXT CHECK (course IN ('A', 'B')),
  ADD COLUMN IF NOT EXISTS selected_dates TEXT[];
