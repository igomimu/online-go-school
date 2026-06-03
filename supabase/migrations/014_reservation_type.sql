-- ==========================================
-- 014: reservations に reservation_type, original_class_id, original_date を追加
-- is_transfer(boolean) から reservation_type(text) へ移行
-- ==========================================

ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS reservation_type TEXT NOT NULL DEFAULT 'additional',
  ADD COLUMN IF NOT EXISTS original_class_id UUID REFERENCES classes(id),
  ADD COLUMN IF NOT EXISTS original_date DATE;

-- 既存の is_transfer=true 行を furikae に移行
UPDATE reservations SET reservation_type = 'furikae' WHERE is_transfer = true;

-- インデックス
CREATE INDEX IF NOT EXISTS idx_reservations_type ON reservations(reservation_type);
CREATE INDEX IF NOT EXISTS idx_reservations_original_class ON reservations(original_class_id) WHERE original_class_id IS NOT NULL;
