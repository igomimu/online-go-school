-- 「生徒ではないイベント参加者」セグメントの導入。
-- 入会済みの内部生（segment='internal'）と、集中特訓などのイベントだけ参加する
-- 外部参加者（segment='external_event' / student_type='event_only'）を区別する。
--
-- 背景: 2026-04 GW集中特訓で external_event_registrations が students/reservations に
-- 展開されないため出席簿に出てこない問題が発覚。外部参加者も students に格納して
-- 既存の出席簿・予約 JOIN ロジックを再利用するための土台を整える。

-- 1. students.segment 列を追加（既存全レコードは default 'internal'）
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS segment text NOT NULL DEFAULT 'internal'
  CHECK (segment IN ('internal', 'external_event'));

CREATE INDEX IF NOT EXISTS idx_students_segment
  ON students(segment) WHERE segment <> 'internal';

-- 2. student_type CHECK 制約に 'event_only' を追加
--    既存値: dojo / net / classroom / spot_classroom / spot_net / net_dojo
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_student_type_check;
ALTER TABLE students ADD CONSTRAINT students_student_type_check
  CHECK (student_type = ANY (ARRAY[
    'dojo'::text,
    'net'::text,
    'classroom'::text,
    'spot_classroom'::text,
    'spot_net'::text,
    'net_dojo'::text,
    'event_only'::text
  ]));

-- 3. external_event_registrations.student_id を追加
--    外部申込が students に展開されたかどうかの追跡に使う。
--    students 削除時は NULL に戻す（履歴として申込み自体は残す）。
ALTER TABLE external_event_registrations
  ADD COLUMN IF NOT EXISTS student_id uuid
  REFERENCES students(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_external_event_reg_student_id
  ON external_event_registrations(student_id) WHERE student_id IS NOT NULL;
