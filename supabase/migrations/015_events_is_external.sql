-- 外部イベントと道場イベントを区別するフラグ
ALTER TABLE events ADD COLUMN IF NOT EXISTS is_external BOOLEAN NOT NULL DEFAULT false;

-- 既存の外部大会を設定
UPDATE events SET is_external = true WHERE name LIKE '%ボンド杯%' OR name LIKE '%キッズカップ%';
