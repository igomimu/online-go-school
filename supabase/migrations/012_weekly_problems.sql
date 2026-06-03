CREATE TABLE IF NOT EXISTS weekly_problems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  board_size INT NOT NULL DEFAULT 9,
  stones JSONB NOT NULL DEFAULT '[]',
  answer_x INT NOT NULL,
  answer_y INT NOT NULL,
  answer_color TEXT NOT NULL DEFAULT 'B',
  solution_comment TEXT,
  posted_by UUID REFERENCES profiles(id),
  posted_at DATE NOT NULL DEFAULT current_date,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE weekly_problems ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_all_weekly_problems" ON weekly_problems
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('staff', 'admin'))
  );

CREATE POLICY "parent_read_published" ON weekly_problems
  FOR SELECT USING (is_published = true);
