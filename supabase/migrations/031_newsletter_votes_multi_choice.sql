-- 031: newsletter_votes 複数回答対応
-- UNIQUE(poll_id, voter_hash) → UNIQUE(poll_id, choice_key, voter_hash)
-- free_text カラム追加（「その他」自由記入用）

ALTER TABLE newsletter_votes DROP CONSTRAINT IF EXISTS newsletter_votes_poll_id_voter_hash_key;
ALTER TABLE newsletter_votes ADD COLUMN IF NOT EXISTS free_text text;
ALTER TABLE newsletter_votes ADD CONSTRAINT newsletter_votes_poll_id_choice_key_voter_hash_key
  UNIQUE(poll_id, choice_key, voter_hash);
