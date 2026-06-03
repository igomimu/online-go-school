-- 023: メールリスト（Systeme.ioからの移行）
-- subscribers: ニュースレター購読者・タグ管理

CREATE TABLE subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  first_name text,
  last_name text,
  tags text[] DEFAULT '{}',
  registered_at timestamptz,
  active boolean DEFAULT true,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_subscribers_email ON subscribers (email);
CREATE INDEX idx_subscribers_tags ON subscribers USING gin (tags);

ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_full_access" ON subscribers
  FOR ALL USING (get_user_role() IN ('admin', 'staff'));
