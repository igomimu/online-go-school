-- 018_board.sql — 掲示板機能
-- 投稿・コメント・リアクション・参加表明

-- ============================
-- テーブル
-- ============================

CREATE TABLE board_posts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  category      TEXT NOT NULL CHECK (category IN ('tournament', 'classroom', 'other')),
  title         TEXT NOT NULL,
  body          TEXT NOT NULL DEFAULT '',
  image_paths   TEXT[] DEFAULT '{}',
  is_pinned     BOOLEAN NOT NULL DEFAULT false,
  is_bot        BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE board_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     UUID NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  author_id   UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body        TEXT NOT NULL,
  image_paths TEXT[] DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE board_reactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id    UUID REFERENCES board_posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES board_comments(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL CHECK (emoji IN ('👍', '❤️', '🎉')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reactions_target_check CHECK (
    (post_id IS NOT NULL AND comment_id IS NULL) OR
    (post_id IS NULL AND comment_id IS NOT NULL)
  )
);

CREATE TABLE board_participations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id      UUID NOT NULL REFERENCES board_posts(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id, student_name)
);

-- ============================
-- インデックス
-- ============================

CREATE INDEX idx_board_posts_category    ON board_posts(category, created_at DESC);
CREATE INDEX idx_board_posts_created     ON board_posts(created_at DESC);
CREATE INDEX idx_board_comments_post     ON board_comments(post_id, created_at);
CREATE INDEX idx_board_participations    ON board_participations(post_id);

-- リアクション: partial unique index（NULLカラム対応）
CREATE UNIQUE INDEX board_reactions_post_unique
  ON board_reactions(post_id, user_id, emoji)
  WHERE post_id IS NOT NULL;

CREATE UNIQUE INDEX board_reactions_comment_unique
  ON board_reactions(comment_id, user_id, emoji)
  WHERE comment_id IS NOT NULL;

-- ============================
-- updated_at トリガー
-- ============================

CREATE OR REPLACE FUNCTION update_board_posts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_board_posts_updated_at
  BEFORE UPDATE ON board_posts
  FOR EACH ROW EXECUTE FUNCTION update_board_posts_updated_at();

-- ============================
-- RLS
-- ============================

ALTER TABLE board_posts          ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_comments       ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_reactions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_participations ENABLE ROW LEVEL SECURITY;

-- board_posts
CREATE POLICY "board_posts_select" ON board_posts
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "board_posts_insert" ON board_posts
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_user_role()) IN ('staff', 'admin', 'parent'));

CREATE POLICY "board_posts_update" ON board_posts
  FOR UPDATE TO authenticated
  USING ((SELECT get_user_role()) IN ('staff', 'admin') OR author_id = auth.uid())
  WITH CHECK (
    (SELECT get_user_role()) IN ('staff', 'admin')
    OR (author_id = auth.uid() AND is_pinned = false)
  );

CREATE POLICY "board_posts_delete" ON board_posts
  FOR DELETE TO authenticated
  USING ((SELECT get_user_role()) IN ('staff', 'admin') OR author_id = auth.uid());

-- board_comments
CREATE POLICY "board_comments_select" ON board_comments
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "board_comments_insert" ON board_comments
  FOR INSERT TO authenticated
  WITH CHECK ((SELECT get_user_role()) IN ('staff', 'admin', 'parent'));

CREATE POLICY "board_comments_delete" ON board_comments
  FOR DELETE TO authenticated
  USING ((SELECT get_user_role()) IN ('staff', 'admin') OR author_id = auth.uid());

-- board_reactions
CREATE POLICY "board_reactions_select" ON board_reactions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "board_reactions_insert" ON board_reactions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "board_reactions_delete" ON board_reactions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- board_participations
CREATE POLICY "board_participations_select" ON board_participations
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "board_participations_insert" ON board_participations
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT get_user_role()) IN ('staff', 'admin', 'parent')
    AND user_id = auth.uid()
  );

CREATE POLICY "board_participations_delete" ON board_participations
  FOR DELETE TO authenticated
  USING ((SELECT get_user_role()) IN ('staff', 'admin') OR user_id = auth.uid());

-- ============================
-- Realtime
-- ============================

ALTER PUBLICATION supabase_realtime ADD TABLE board_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE board_comments;
