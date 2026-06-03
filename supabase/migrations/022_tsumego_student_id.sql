-- 022: 詰碁テーブルに student_id を追加（子供ごとの進捗分離）

-- tsumego_streaks
ALTER TABLE tsumego_streaks ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES students(id);
ALTER TABLE tsumego_streaks DROP CONSTRAINT IF EXISTS tsumego_streaks_user_id_study_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tsumego_streaks_user_student_date
  ON tsumego_streaks(user_id, COALESCE(student_id, '00000000-0000-0000-0000-000000000000'::uuid), study_date);

-- tsumego_user_progress
ALTER TABLE tsumego_user_progress ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES students(id);

-- prefecture_progress
ALTER TABLE prefecture_progress ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES students(id);
