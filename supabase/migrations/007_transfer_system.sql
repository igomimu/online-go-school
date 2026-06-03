-- ==========================================
-- 007: 振替システム
-- absence_reports に振替期限、reservations に振替フラグを追加
-- ==========================================

-- absence_reports に振替期限を追加
ALTER TABLE absence_reports
  ADD COLUMN IF NOT EXISTS transfer_expires_at DATE;

-- reservations に振替フラグ・欠席紐付けを追加
ALTER TABLE reservations
  ADD COLUMN IF NOT EXISTS is_transfer BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS absence_report_id UUID REFERENCES absence_reports(id);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_absence_transfer_expires ON absence_reports(transfer_expires_at);
CREATE INDEX IF NOT EXISTS idx_reservations_transfer ON reservations(is_transfer) WHERE is_transfer = true;
CREATE INDEX IF NOT EXISTS idx_reservations_absence_report ON reservations(absence_report_id);

-- 振替の二重使用を防止（同じ欠席IDは1つのアクティブ予約にしか紐付け不可）
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_absence_unique
  ON reservations(absence_report_id)
  WHERE absence_report_id IS NOT NULL AND status != 'cancelled';

-- 振替の重複予約を防止（同一生徒・クラス・日付で1件のみ）
CREATE UNIQUE INDEX IF NOT EXISTS idx_reservations_student_class_date_active
  ON reservations(student_id, class_id, date)
  WHERE status != 'cancelled';

-- 振替整合性チェック: 同一生徒の欠席か & 期限内か
CREATE OR REPLACE FUNCTION validate_transfer_reservation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_transfer = true AND NEW.absence_report_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM absence_reports
      WHERE id = NEW.absence_report_id
        AND student_id = NEW.student_id
    ) THEN
      RAISE EXCEPTION 'Absence report does not belong to this student';
    END IF;

    IF EXISTS (
      SELECT 1 FROM absence_reports
      WHERE id = NEW.absence_report_id
        AND transfer_expires_at < CURRENT_DATE
    ) THEN
      RAISE EXCEPTION 'Transfer credit has expired';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS check_transfer_reservation ON reservations;
CREATE TRIGGER check_transfer_reservation
  BEFORE INSERT OR UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION validate_transfer_reservation();
