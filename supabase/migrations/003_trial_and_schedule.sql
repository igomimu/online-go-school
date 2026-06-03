-- ==========================================
-- Phase 2: 体験対応 + students 拡張
-- ==========================================

-- students.status に 'trial' を追加
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_status_check;
ALTER TABLE students ADD CONSTRAINT students_status_check
    CHECK (status IN ('active', 'suspended', 'withdrawn', 'trial'));

-- 体験情報カラム追加
ALTER TABLE students ADD COLUMN IF NOT EXISTS trial_date DATE;
ALTER TABLE students ADD COLUMN IF NOT EXISTS trial_class_id UUID REFERENCES classes(id);
ALTER TABLE students ADD COLUMN IF NOT EXISTS trial_note TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;
