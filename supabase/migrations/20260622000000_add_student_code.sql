-- student_code: 4桁数字コード（生徒がログイン時に入力する短いID）
-- net生徒のみ付与。created_at順で 1001 から採番。

ALTER TABLE students ADD COLUMN IF NOT EXISTS student_code TEXT;

ALTER TABLE students ADD CONSTRAINT students_student_code_check
  CHECK (student_code IS NULL OR student_code ~ '^\d{4}$');

CREATE UNIQUE INDEX IF NOT EXISTS students_student_code_key
  ON students(student_code) WHERE student_code IS NOT NULL;

-- 既存 net 生徒にバックフィル（created_at, id 順で 1001〜）
WITH numbered AS (
  SELECT id, (ROW_NUMBER() OVER (ORDER BY created_at, id) + 1000)::TEXT AS code
  FROM students
  WHERE student_type = 'net'
)
UPDATE students s
SET student_code = n.code
FROM numbered n
WHERE s.id = n.id;
