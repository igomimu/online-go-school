-- 旧「道場生」（day_of_week=NULL）を非アクティブ化
UPDATE classes SET is_active = false WHERE name = '道場生' AND day_of_week IS NULL;

-- 道場生 曜日別クラス（月火水金）を追加
INSERT INTO classes (name, day_of_week, start_time, end_time, capacity, class_type, is_active)
VALUES
  ('道場生（月）', 1, '10:00', '21:00', 20, 'regular', true),
  ('道場生（火）', 2, '10:00', '21:00', 20, 'regular', true),
  ('道場生（水）', 3, '10:00', '21:00', 20, 'regular', true),
  ('道場生（金）', 5, '10:00', '21:00', 20, 'regular', true);
