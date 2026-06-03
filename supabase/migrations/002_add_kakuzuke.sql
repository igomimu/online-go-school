-- 格付けカラム追加
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS kakuzuke TEXT NOT NULL DEFAULT 'tamago'
  CHECK (kakuzuke IN ('tamago','piyopiyo','minarai','shikkarisan','tatsujin'));
CREATE INDEX IF NOT EXISTS idx_students_kakuzuke ON students(kakuzuke);

-- チェックイン時刻追加（お迎え通知用）
ALTER TABLE attendance
  ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notification_sent BOOLEAN NOT NULL DEFAULT false;

-- お迎え通知テーブル
CREATE TABLE IF NOT EXISTS pickup_notifications (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES students(id) NOT NULL,
  attendance_id UUID REFERENCES attendance(id) NOT NULL,
  parent_profile_id UUID REFERENCES profiles(id),
  message TEXT NOT NULL,
  channels TEXT[] DEFAULT '{}',
  sent_at TIMESTAMPTZ DEFAULT now(),
  read_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pickup_notifications_parent
  ON pickup_notifications(parent_profile_id, read_at);

-- RLS
ALTER TABLE pickup_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff can manage notifications" ON pickup_notifications
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('staff','admin'))
  );
CREATE POLICY "Parents see own notifications" ON pickup_notifications
  FOR SELECT USING (parent_profile_id = auth.uid());
