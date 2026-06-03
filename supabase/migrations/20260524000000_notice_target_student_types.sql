-- 生徒タイプ別お知らせ配信の対応およびRLS修正
-- 生成日: 2026-05-24

-- 1. messages テーブルに target_student_types カラム (TEXT[]) を追加する
ALTER TABLE public.messages 
  ADD COLUMN IF NOT EXISTS target_student_types TEXT[] DEFAULT NULL;

-- 2. 既存の messages_parent_select RLS ポリシーの更新
DROP POLICY IF EXISTS "messages_parent_select" ON public.messages;

CREATE POLICY "messages_parent_select" ON public.messages FOR SELECT
  USING (
    (SELECT get_user_role()) IN ('admin', 'staff')
    OR
    (
      message_type = 'notice'
      AND (
        -- 全員宛てのお知らせ（target_student_types が NULL または空配列）
        target_student_types IS NULL 
        OR array_length(target_student_types, 1) IS NULL
        -- または、自分が受信者レコードとして明示的に登録されている
        OR EXISTS (
          SELECT 1 FROM public.message_recipients mr
          WHERE mr.message_id = messages.id
            AND mr.recipient_id = auth.uid()
        )
        -- または自分が送信者である
        OR sender_id = auth.uid()
      )
    )
    OR
    (
      message_type = 'dm'
      AND (
        -- 自分宛てのDM（自分がmessage_recipientsになっている、または自分が送信した）
        EXISTS (
          SELECT 1 FROM public.message_recipients mr
          WHERE mr.message_id = messages.id
            AND mr.recipient_id = auth.uid()
        )
        OR sender_id = auth.uid()
      )
    )
  );
