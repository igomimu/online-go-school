-- DMイイねリアクション

CREATE TABLE IF NOT EXISTS message_reactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  emoji      TEXT NOT NULL DEFAULT '👍' CHECK (emoji IN ('👍')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_message_reactions_message
  ON message_reactions(message_id);

CREATE INDEX IF NOT EXISTS idx_message_reactions_user
  ON message_reactions(user_id);

ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "message_reactions_select_visible_dm" ON message_reactions;
CREATE POLICY "message_reactions_select_visible_dm" ON message_reactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM messages m
      WHERE m.id = message_reactions.message_id
        AND m.message_type = 'dm'
        AND (
          (SELECT get_user_role()) IN ('admin', 'staff')
          OR m.sender_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM message_recipients mr
            WHERE mr.message_id = m.id
              AND mr.recipient_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "message_reactions_insert_own_visible_dm" ON message_reactions;
CREATE POLICY "message_reactions_insert_own_visible_dm" ON message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM messages m
      WHERE m.id = message_reactions.message_id
        AND m.message_type = 'dm'
        AND (
          (SELECT get_user_role()) IN ('admin', 'staff')
          OR m.sender_id = auth.uid()
          OR EXISTS (
            SELECT 1
            FROM message_recipients mr
            WHERE mr.message_id = m.id
              AND mr.recipient_id = auth.uid()
          )
        )
    )
  );

DROP POLICY IF EXISTS "message_reactions_delete_own" ON message_reactions;
CREATE POLICY "message_reactions_delete_own" ON message_reactions
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());
