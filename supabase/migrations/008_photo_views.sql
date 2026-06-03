-- 008: 写真閲覧トラッキング（新着バッジ用）
CREATE TABLE IF NOT EXISTS photo_views (
  profile_id UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE photo_views ENABLE ROW LEVEL SECURITY;

-- 保護者は自分のrowのみ
DROP POLICY IF EXISTS "photo_views_parent_own" ON photo_views;
CREATE POLICY "photo_views_parent_own" ON photo_views FOR ALL
  USING (profile_id = auth.uid());

-- staff/adminは全アクセス
DROP POLICY IF EXISTS "photo_views_staff_all" ON photo_views;
CREATE POLICY "photo_views_staff_all" ON photo_views FOR ALL
  USING ((SELECT get_user_role()) IN ('admin', 'staff'));
