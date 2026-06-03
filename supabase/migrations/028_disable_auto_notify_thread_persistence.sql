-- ==========================================
-- 028: 自動通知はDMスレッドに保存しない
-- 予約・欠席・申込の自動返信で conversations/messages を増やさない
-- ==========================================

CREATE OR REPLACE FUNCTION send_auto_notify(
  p_parent_user_id UUID,
  p_body TEXT
) RETURNS UUID AS $$
BEGIN
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION send_auto_notify(UUID, TEXT) TO authenticated;
