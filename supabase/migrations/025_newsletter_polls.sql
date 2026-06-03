-- 025: ニュースレター読者1クリック投票
-- 「今週の一手投票」：みむいご通信の読者参加コーナー

-- ============================================
-- newsletter_polls: 投票設問
-- ============================================
CREATE TABLE newsletter_polls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_label text UNIQUE NOT NULL,        -- e.g. 'mimuigo-2026-04-26'
  question text NOT NULL,
  description text,                         -- markdown可の補足説明
  choices jsonb NOT NULL,                   -- [{"key":"a","label":"黒3三"},{"key":"b","label":"..."}]
  image_url text,                           -- 問題図URL（オプショナル）
  published_at timestamptz NOT NULL DEFAULT now(),
  closes_at timestamptz NOT NULL,
  commentary text,                          -- 次号配信時に追記する九段コメント
  created_at timestamptz DEFAULT now(),
  created_by text
);

CREATE INDEX idx_polls_published ON newsletter_polls(published_at DESC);

-- ============================================
-- newsletter_votes: 投票記録
-- ============================================
CREATE TABLE newsletter_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poll_id uuid NOT NULL REFERENCES newsletter_polls(id) ON DELETE CASCADE,
  choice_key text NOT NULL,
  voter_hash text NOT NULL,                 -- SHA-256(email.toLowerCase()) hex
  email_b64 text,                           -- 任意：base64(email) 集計用
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(poll_id, voter_hash)
);

CREATE INDEX idx_votes_poll ON newsletter_votes(poll_id);

-- ============================================
-- 結果ビュー（集計、anon SELECT可）
--   security_invoker は既定(false)。ビューは所有者権限で RLS バイパスし、
--   集計数のみを公開する（個票は見せない）。
-- ============================================
CREATE VIEW newsletter_poll_results AS
SELECT
  p.id AS poll_id,
  p.issue_label,
  p.question,
  p.closes_at,
  p.image_url,
  c.key AS choice_key,
  c.label AS choice_label,
  COALESCE(vc.vote_count, 0)::int AS vote_count,
  CASE
    WHEN SUM(COALESCE(vc.vote_count, 0)) OVER (PARTITION BY p.id) > 0
    THEN ROUND(
      100.0 * COALESCE(vc.vote_count, 0) /
        SUM(COALESCE(vc.vote_count, 0)) OVER (PARTITION BY p.id),
      1
    )
    ELSE 0
  END AS percentage
FROM newsletter_polls p
CROSS JOIN LATERAL jsonb_to_recordset(p.choices) AS c(key text, label text)
LEFT JOIN (
  SELECT poll_id, choice_key, COUNT(*)::int AS vote_count
  FROM newsletter_votes
  GROUP BY poll_id, choice_key
) vc ON vc.poll_id = p.id AND vc.choice_key = c.key;

-- ============================================
-- RLS
-- ============================================
ALTER TABLE newsletter_polls ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_votes ENABLE ROW LEVEL SECURITY;

-- polls: 公開日以降は anon SELECT 可
CREATE POLICY "polls_read_public" ON newsletter_polls
  FOR SELECT TO anon
  USING (published_at IS NOT NULL AND published_at <= now());

CREATE POLICY "polls_staff_all" ON newsletter_polls
  FOR ALL
  USING (get_user_role() IN ('admin', 'staff'));

-- votes: anon 完全遮断（service_role のみ書き込み）
-- staff は SELECT 可
CREATE POLICY "votes_staff_read" ON newsletter_votes
  FOR SELECT
  USING (get_user_role() IN ('admin', 'staff'));

-- ============================================
-- grants
-- ============================================
GRANT SELECT ON newsletter_poll_results TO anon;
GRANT SELECT ON newsletter_poll_results TO authenticated;
