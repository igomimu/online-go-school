-- 016: 詰碁統合 — テーブル・RLS・ストリーク関数
-- Phase 0: DB基盤（UI変更なし）

-- ============================================================
-- 1. profiles.role に 'student' を追加
-- ============================================================
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'staff', 'parent', 'student'));

-- ============================================================
-- 2. students に auth_user_id カラム追加（生徒ログイン紐付け）
-- ============================================================
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE REFERENCES auth.users(id);

-- ============================================================
-- 3. tsumego_problems（問題マスタ）
-- ============================================================
CREATE TABLE IF NOT EXISTS tsumego_problems (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id INTEGER NOT NULL UNIQUE,
  board_size INTEGER NOT NULL DEFAULT 19,
  black_first BOOLEAN NOT NULL DEFAULT TRUE,
  level TEXT NOT NULL,
  problem_type TEXT NOT NULL,
  book_info TEXT,
  initial_black TEXT[] NOT NULL,
  initial_white TEXT[] NOT NULL,
  answer_tree JSONB NOT NULL,
  view_range JSONB NOT NULL,
  difficulty_rating SMALLINT DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'unverified',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tsumego_problems_level ON tsumego_problems(level);
CREATE INDEX IF NOT EXISTS idx_tsumego_problems_status ON tsumego_problems(status);

-- ============================================================
-- 4. tsumego_attempts（解答記録）
-- ============================================================
CREATE TABLE IF NOT EXISTS tsumego_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  student_id UUID REFERENCES students(id),
  problem_id UUID REFERENCES tsumego_problems(id) NOT NULL,
  session_id UUID,
  is_correct BOOLEAN NOT NULL,
  time_spent_ms INTEGER,
  move_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tsumego_attempts_user ON tsumego_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_tsumego_attempts_student ON tsumego_attempts(student_id);
CREATE INDEX IF NOT EXISTS idx_tsumego_attempts_created ON tsumego_attempts(created_at);

-- ============================================================
-- 5. tsumego_streaks（ストリーク記録）
-- ============================================================
CREATE TABLE IF NOT EXISTS tsumego_streaks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  study_date DATE NOT NULL,
  xp_earned INTEGER NOT NULL DEFAULT 0,
  sessions_count INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, study_date)
);

CREATE INDEX IF NOT EXISTS idx_tsumego_streaks_user_date ON tsumego_streaks(user_id, study_date DESC);

-- ============================================================
-- 6. tsumego_user_progress（Leitnerボックス）
-- ============================================================
CREATE TABLE IF NOT EXISTS tsumego_user_progress (
  user_id UUID REFERENCES auth.users(id),
  problem_id UUID REFERENCES tsumego_problems(id),
  box_level SMALLINT DEFAULT 0,
  next_review_at TIMESTAMPTZ,
  times_correct INTEGER DEFAULT 0,
  times_wrong INTEGER DEFAULT 0,
  last_attempted_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, problem_id)
);

CREATE INDEX IF NOT EXISTS idx_tsumego_user_progress_review
  ON tsumego_user_progress(user_id, next_review_at);

-- ============================================================
-- 7. RLS ポリシー
-- ============================================================
ALTER TABLE tsumego_problems ENABLE ROW LEVEL SECURITY;
ALTER TABLE tsumego_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tsumego_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE tsumego_user_progress ENABLE ROW LEVEL SECURITY;

-- 問題: 認証済みユーザーは全員読める
CREATE POLICY "tsumego_problems_select" ON tsumego_problems
  FOR SELECT TO authenticated USING (true);

-- 問題: staff/adminのみ変更可
CREATE POLICY "tsumego_problems_staff_manage" ON tsumego_problems
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- 解答記録: 本人CRUD
CREATE POLICY "tsumego_attempts_own" ON tsumego_attempts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id);

-- 解答記録: 親は子のSELECT可
CREATE POLICY "tsumego_attempts_parent_read" ON tsumego_attempts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.auth_user_id = tsumego_attempts.user_id
        AND s.parent_profile_id = auth.uid()
    )
  );

-- 解答記録: staff全アクセス
CREATE POLICY "tsumego_attempts_staff" ON tsumego_attempts
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- ストリーク: 本人CRUD
CREATE POLICY "tsumego_streaks_own" ON tsumego_streaks
  FOR ALL TO authenticated
  USING (auth.uid() = user_id);

-- ストリーク: 親は子のSELECT可
CREATE POLICY "tsumego_streaks_parent_read" ON tsumego_streaks
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM students s
      WHERE s.auth_user_id = tsumego_streaks.user_id
        AND s.parent_profile_id = auth.uid()
    )
  );

-- ストリーク: staff全アクセス
CREATE POLICY "tsumego_streaks_staff" ON tsumego_streaks
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- user_progress: 本人CRUD
CREATE POLICY "tsumego_user_progress_own" ON tsumego_user_progress
  FOR ALL TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- 8. get_current_streak() RPC関数
-- ============================================================
CREATE OR REPLACE FUNCTION get_current_streak(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  streak INTEGER := 0;
  check_date DATE;
  today_jst DATE;
BEGIN
  -- JST基準の今日
  today_jst := (NOW() AT TIME ZONE 'Asia/Tokyo')::DATE;
  check_date := today_jst;

  -- 今日の記録がなければ昨日から開始
  IF NOT EXISTS (
    SELECT 1 FROM tsumego_streaks
    WHERE user_id = p_user_id AND study_date = check_date
  ) THEN
    check_date := check_date - 1;
  END IF;

  -- 連続日数をカウント
  LOOP
    IF EXISTS (
      SELECT 1 FROM tsumego_streaks
      WHERE user_id = p_user_id AND study_date = check_date
    ) THEN
      streak := streak + 1;
      check_date := check_date - 1;
    ELSE
      EXIT;
    END IF;
  END LOOP;

  RETURN streak;
END;
$$;
