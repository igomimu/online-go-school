-- ==========================================
-- 024: sendAutoNotify RLS修正
-- 保護者セッションからadmin名義のDMを挿入できるようSECURITY DEFINER関数を作成
-- ==========================================

-- 管理者名義で自動通知DMを送信するDB関数
-- 保護者のブラウザから呼ばれても、SECURITY DEFINERでRLSをバイパスする
CREATE OR REPLACE FUNCTION send_auto_notify(
  p_parent_user_id UUID,
  p_body TEXT
) RETURNS UUID AS $$
DECLARE
  v_admin_id UUID;
  v_conv_id UUID;
  v_msg_id UUID;
  v_pa UUID;
  v_pb UUID;
BEGIN
  -- admin取得
  SELECT id INTO v_admin_id FROM profiles WHERE role = 'admin' LIMIT 1;
  IF v_admin_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- participant正規化（小さいUUIDをA）
  IF p_parent_user_id < v_admin_id THEN
    v_pa := p_parent_user_id;
    v_pb := v_admin_id;
  ELSE
    v_pa := v_admin_id;
    v_pb := p_parent_user_id;
  END IF;

  -- 会話取得 or 作成
  SELECT id INTO v_conv_id FROM conversations
    WHERE participant_a = v_pa AND participant_b = v_pb;

  IF v_conv_id IS NULL THEN
    INSERT INTO conversations (participant_a, participant_b)
    VALUES (v_pa, v_pb)
    RETURNING id INTO v_conv_id;
  END IF;

  -- メッセージ挿入（admin名義）
  INSERT INTO messages (sender_id, title, body, message_type, target_role, is_pinned, conversation_id)
  VALUES (v_admin_id, '', p_body, 'dm', NULL, false, v_conv_id)
  RETURNING id INTO v_msg_id;

  -- 受信者レコード
  INSERT INTO message_recipients (message_id, recipient_id)
  VALUES (v_msg_id, p_parent_user_id);

  -- 会話の最終メッセージ日時更新
  UPDATE conversations SET last_message_at = NOW() WHERE id = v_conv_id;

  RETURN v_msg_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 保護者からの呼び出しを許可
GRANT EXECUTE ON FUNCTION send_auto_notify(UUID, TEXT) TO authenticated;
