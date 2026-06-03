-- 017: 詰碁ソーシャル機能 — ランキングRPC + ナッジテーブル

-- ============================================================
-- 1. ランキング関数（週間XP トップ10）
-- ============================================================
CREATE OR REPLACE FUNCTION get_tsumego_weekly_ranking()
RETURNS TABLE (
  user_id UUID,
  student_name TEXT,
  kakuzuke TEXT,
  total_xp BIGINT,
  current_streak INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ts.user_id,
    s.name AS student_name,
    s.kakuzuke::TEXT,
    SUM(ts.xp_earned)::BIGINT AS total_xp,
    get_current_streak(ts.user_id) AS current_streak
  FROM tsumego_streaks ts
  JOIN students s ON s.auth_user_id = ts.user_id
  WHERE ts.study_date >= (NOW() AT TIME ZONE 'Asia/Tokyo')::DATE - INTERVAL '6 days'
  GROUP BY ts.user_id, s.name, s.kakuzuke
  ORDER BY total_xp DESC
  LIMIT 10;
END;
$$;

-- ============================================================
-- 2. ナッジテーブル
-- ============================================================
CREATE TABLE IF NOT EXISTS tsumego_nudges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID REFERENCES auth.users(id) NOT NULL,
  receiver_id UUID REFERENCES auth.users(id) NOT NULL,
  nudge_type TEXT NOT NULL DEFAULT 'streak_reminder',
  message TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  read_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tsumego_nudges_receiver
  ON tsumego_nudges(receiver_id, read_at);

-- RLS
ALTER TABLE tsumego_nudges ENABLE ROW LEVEL SECURITY;

-- staff/admin: 全操作可
CREATE POLICY "tsumego_nudges_staff" ON tsumego_nudges
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'staff'))
  );

-- 生徒: 自分宛のみ読める
CREATE POLICY "tsumego_nudges_read_own" ON tsumego_nudges
  FOR SELECT TO authenticated
  USING (receiver_id = auth.uid());

-- 生徒: 自分宛を既読にできる
CREATE POLICY "tsumego_nudges_update_own" ON tsumego_nudges
  FOR UPDATE TO authenticated
  USING (receiver_id = auth.uid());

-- ============================================================
-- 3. students に nickname カラム追加
-- ============================================================
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS nickname TEXT;
