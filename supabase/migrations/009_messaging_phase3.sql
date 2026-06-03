-- ==========================================
-- 009: メッセージ Phase 3 — 会話スレッド・既読管理・リアルタイム
-- ==========================================

-- conversations テーブル
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_a UUID NOT NULL REFERENCES profiles(id),
  participant_b UUID NOT NULL REFERENCES profiles(id),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(participant_a, participant_b)
);

-- participant_a < participant_b に正規化するトリガー（重複防止）
CREATE OR REPLACE FUNCTION normalize_conversation_participants()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.participant_a > NEW.participant_b THEN
    -- swap
    DECLARE tmp UUID;
    BEGIN
      tmp := NEW.participant_a;
      NEW.participant_a := NEW.participant_b;
      NEW.participant_b := tmp;
    END;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_normalize_conversation ON conversations;
CREATE TRIGGER trg_normalize_conversation
  BEFORE INSERT OR UPDATE ON conversations
  FOR EACH ROW EXECUTE FUNCTION normalize_conversation_participants();

-- messages に conversation_id カラム追加
ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id);

-- RLS: conversations
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conversations_staff_all" ON conversations;
CREATE POLICY "conversations_staff_all" ON conversations FOR ALL
  USING ((SELECT get_user_role()) IN ('admin', 'staff'));

DROP POLICY IF EXISTS "conversations_parent_own" ON conversations;
CREATE POLICY "conversations_parent_own" ON conversations FOR ALL
  USING (participant_a = auth.uid() OR participant_b = auth.uid());

-- RLS: messages — parent が送信したDMも見えるように拡張
-- 既存ポリシーを置き換え
DROP POLICY IF EXISTS "messages_parent_select" ON messages;
CREATE POLICY "messages_parent_select" ON messages FOR SELECT
  USING (
    (SELECT get_user_role()) IN ('admin', 'staff')
    OR
    (
      message_type IN ('notice', 'dm')
      AND (
        EXISTS (
          SELECT 1 FROM message_recipients mr
          WHERE mr.message_id = messages.id
            AND mr.recipient_id = auth.uid()
        )
        OR sender_id = auth.uid()
      )
    )
  );

-- parent が DM を INSERT できるポリシー
DROP POLICY IF EXISTS "messages_parent_insert_dm" ON messages;
CREATE POLICY "messages_parent_insert_dm" ON messages FOR INSERT
  WITH CHECK (
    (SELECT get_user_role()) IN ('admin', 'staff')
    OR (message_type = 'dm' AND sender_id = auth.uid())
  );

-- parent が message_recipients を INSERT できるポリシー（DM配信用）
DROP POLICY IF EXISTS "recipients_parent_insert" ON message_recipients;
CREATE POLICY "recipients_parent_insert" ON message_recipients FOR INSERT
  WITH CHECK (
    (SELECT get_user_role()) IN ('admin', 'staff')
    OR EXISTS (
      SELECT 1 FROM messages m
      WHERE m.id = message_id
        AND m.message_type = 'dm'
        AND m.sender_id = auth.uid()
    )
  );

-- インデックス
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_participant_a ON conversations(participant_a);
CREATE INDEX IF NOT EXISTS idx_conversations_participant_b ON conversations(participant_b);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at DESC);

-- 既存DMのバックフィル: conversation_idが無いDMに会話を作成
DO $$
DECLARE
  dm_rec RECORD;
  conv_id UUID;
  p_a UUID;
  p_b UUID;
BEGIN
  FOR dm_rec IN
    SELECT m.id AS message_id, m.sender_id,
           (SELECT mr.recipient_id FROM message_recipients mr WHERE mr.message_id = m.id LIMIT 1) AS recipient_id
    FROM messages m
    WHERE m.message_type = 'dm'
      AND m.conversation_id IS NULL
      AND EXISTS (SELECT 1 FROM message_recipients mr WHERE mr.message_id = m.id)
  LOOP
    IF dm_rec.recipient_id IS NULL THEN
      CONTINUE;
    END IF;

    -- 正規化（小さいUUIDをparticipant_a）
    IF dm_rec.sender_id < dm_rec.recipient_id THEN
      p_a := dm_rec.sender_id;
      p_b := dm_rec.recipient_id;
    ELSE
      p_a := dm_rec.recipient_id;
      p_b := dm_rec.sender_id;
    END IF;

    -- 会話取得 or 作成
    SELECT c.id INTO conv_id
    FROM conversations c
    WHERE c.participant_a = p_a AND c.participant_b = p_b;

    IF conv_id IS NULL THEN
      INSERT INTO conversations (participant_a, participant_b, last_message_at)
      VALUES (p_a, p_b, NOW())
      RETURNING id INTO conv_id;
    END IF;

    -- メッセージにconversation_idを設定
    UPDATE messages SET conversation_id = conv_id WHERE id = dm_rec.message_id;
  END LOOP;
END;
$$;

-- Realtime パブリケーション
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE message_recipients;
ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
