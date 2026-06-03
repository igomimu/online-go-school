-- 026: ニュースレター読者からの質問・おたより受付
-- 匿名希望者向けの専用フォーム（mimura15.jp/ask）から投稿される。
-- 匿名にこだわらない人はメール返信で受ける運用。

CREATE TABLE newsletter_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pen_name text NOT NULL,                  -- 掲載時の表示名（読者指定、必須）
  email text,                              -- 任意。内部追跡用、公開しない
  body text NOT NULL,                      -- 質問・おたより本文
  publish_ok boolean NOT NULL DEFAULT false, -- 通信掲載の同意（opt-in）
  honeypot text,                           -- bot対策。人間は入れない、値があれば隔離
  issue_label text,                        -- 掲載された号（後日記入、例: mimuigo-2026-05-03）
  reply_commentary text,                   -- 三村九段の返信・コメント
  hidden boolean NOT NULL DEFAULT false,   -- 個人情報スクリーニング用フラグ
  created_at timestamptz DEFAULT now(),
  published_at timestamptz
);

CREATE INDEX idx_questions_created ON newsletter_questions(created_at DESC);
CREATE INDEX idx_questions_issue ON newsletter_questions(issue_label);

ALTER TABLE newsletter_questions ENABLE ROW LEVEL SECURITY;

-- anon から INSERT のみ許可
CREATE POLICY "questions_anon_insert" ON newsletter_questions
  FOR INSERT TO anon
  WITH CHECK (
    char_length(pen_name) BETWEEN 1 AND 40
    AND char_length(body) BETWEEN 1 AND 4000
  );

-- staff 全アクセス
CREATE POLICY "questions_staff_all" ON newsletter_questions
  FOR ALL
  USING (get_user_role() IN ('admin', 'staff'));
