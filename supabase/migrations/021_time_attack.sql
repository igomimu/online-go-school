-- 021: タイムアタック記録テーブル

CREATE TABLE IF NOT EXISTS time_attack_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  student_id UUID REFERENCES students(id),
  mode TEXT NOT NULL CHECK (mode IN ('3min', '5min', '10min')),
  level_range TEXT NOT NULL,
  problems_solved INTEGER NOT NULL DEFAULT 0,
  problems_correct INTEGER NOT NULL DEFAULT 0,
  total_time_ms INTEGER NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_attack_ranking
  ON time_attack_records(mode, score DESC);

CREATE INDEX IF NOT EXISTS idx_time_attack_user
  ON time_attack_records(user_id, created_at DESC);

ALTER TABLE time_attack_records ENABLE ROW LEVEL SECURITY;

-- 全員閲覧可（ランキング）
CREATE POLICY "time_attack_read" ON time_attack_records
  FOR SELECT TO authenticated USING (true);

-- 本人のみ挿入
CREATE POLICY "time_attack_insert" ON time_attack_records
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- ランキングRPC: モード別ベストスコア（生徒名付き）
CREATE OR REPLACE FUNCTION get_time_attack_ranking(p_mode TEXT)
RETURNS TABLE (
  user_id UUID,
  student_name TEXT,
  score INTEGER,
  problems_solved INTEGER,
  problems_correct INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (tar.user_id)
    tar.user_id,
    s.name AS student_name,
    tar.score,
    tar.problems_solved,
    tar.problems_correct,
    tar.created_at
  FROM time_attack_records tar
  JOIN students s ON s.auth_user_id = tar.user_id
  WHERE tar.mode = p_mode
  ORDER BY tar.user_id, tar.score DESC;
END;
$$;
