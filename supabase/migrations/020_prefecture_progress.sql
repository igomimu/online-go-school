-- 020: 全国行脚（都道府県進捗）テーブル

-- ============================================================
-- 1. prefecture_progress（都道府県進捗）
-- ============================================================
CREATE TABLE IF NOT EXISTS prefecture_progress (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  prefecture_id INTEGER NOT NULL,
  is_cleared BOOLEAN DEFAULT FALSE,
  attempts INTEGER DEFAULT 0,
  cleared_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, prefecture_id)
);

CREATE INDEX IF NOT EXISTS idx_prefecture_progress_user
  ON prefecture_progress(user_id);

-- ============================================================
-- 2. RLS ポリシー
-- ============================================================
ALTER TABLE prefecture_progress ENABLE ROW LEVEL SECURITY;

-- 本人CRUD
CREATE POLICY "prefecture_progress_own" ON prefecture_progress
  FOR ALL TO authenticated
  USING (auth.uid() = user_id);

-- staff/admin: 全生徒閲覧
CREATE POLICY "prefecture_progress_staff_read" ON prefecture_progress
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- parent: 子供の閲覧
CREATE POLICY "prefecture_progress_parent_read" ON prefecture_progress
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.auth_user_id = prefecture_progress.user_id
        AND s.parent_profile_id = auth.uid()
    )
  );
