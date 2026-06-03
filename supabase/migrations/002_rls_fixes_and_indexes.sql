-- ==========================================
-- Phase 1: RLS修正 + インデックス追加
-- ==========================================

-- 1-8: profiles SELECT制限
-- 保護者は自分のプロフィールのみ + スタッフは全員見える
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select_staff" ON profiles FOR SELECT
    USING (get_user_role() IN ('admin', 'staff'));
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
    USING (auth.uid() = id);

-- 1-9: messages DM可視性修正
-- 保護者はDMのうち自分がrecipientのものだけ見える
DROP POLICY IF EXISTS "messages_parent_select" ON messages;
CREATE POLICY "messages_parent_select" ON messages FOR SELECT
    USING (
        get_user_role() = 'parent'
        AND (
            -- お知らせ: recipientに自分がいるもの
            (message_type = 'notice' AND id IN (
                SELECT message_id FROM message_recipients WHERE recipient_id = auth.uid()
            ))
            OR
            -- DM: recipientに自分がいるもの
            (message_type = 'dm' AND id IN (
                SELECT message_id FROM message_recipients WHERE recipient_id = auth.uid()
            ))
        )
    );

-- 1-10: 不足インデックス
CREATE INDEX IF NOT EXISTS idx_reservations_student ON reservations(student_id);
CREATE INDEX IF NOT EXISTS idx_absence_student ON absence_reports(student_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_recipients_message ON message_recipients(message_id);
CREATE INDEX IF NOT EXISTS idx_students_class_schedule ON students USING gin(class_schedule);
