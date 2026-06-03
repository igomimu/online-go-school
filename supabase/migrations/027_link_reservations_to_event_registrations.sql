-- reservations を event_registrations に紐付けて、キャンセル時の自動削除を可能にする。
-- 集中特訓の申込→出席簿表示の一貫性を担保する。

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS event_registration_id UUID
  REFERENCES event_registrations(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_reservations_event_registration_id
  ON reservations(event_registration_id)
  WHERE event_registration_id IS NOT NULL;

-- 既存の手動バックフィル分（2026-04-01 13:42 に一括作成）を紐付ける
-- イベントクラスの reservation で、(student_id, date) が一致する event_registration を探して紐付け
UPDATE reservations r
SET event_registration_id = er.id
FROM event_registrations er, classes c
WHERE r.event_registration_id IS NULL
  AND c.id = r.class_id
  AND c.class_type = 'event'
  AND r.student_id = er.student_id
  AND er.selected_dates IS NOT NULL
  AND (r.date::text) = ANY(er.selected_dates)
  AND er.status = 'registered';
