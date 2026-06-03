-- 道場クラス シードデータ
-- day_of_week: 0=日, 1=月, 2=火, 3=水, 4=木, 5=金, 6=土

-- ── 土曜クラス ──
INSERT INTO classes (name, day_of_week, start_time, end_time, capacity, class_type)
VALUES
  ('土曜クラス', 6, '13:00', '15:00', 30, 'regular'),
  ('土曜クラス2（有段者）', 6, '15:30', '17:30', 20, 'regular');

-- ── 日曜クラス ──
INSERT INTO classes (name, day_of_week, start_time, end_time, capacity, class_type)
VALUES
  ('日曜午前クラス', 0, '10:00', '12:00', 25, 'regular'),
  ('日曜午後クラス', 0, '13:00', '15:00', 25, 'regular');

-- ── 水曜クラス（有段者） ──
INSERT INTO classes (name, day_of_week, start_time, end_time, capacity, class_type)
VALUES
  ('水曜有段者クラス', 3, '16:00', '18:00', 15, 'regular');

-- ── 道場生（平日フリー） ──
INSERT INTO classes (name, day_of_week, start_time, end_time, capacity, class_type)
VALUES
  ('道場生（月）', 1, '10:00', '21:00', 10, 'regular'),
  ('道場生（火）', 2, '10:00', '21:00', 10, 'regular'),
  ('道場生（水）', 3, '10:00', '21:00', 10, 'regular'),
  ('道場生（金）', 5, '10:00', '21:00', 10, 'regular'),
  ('道場生（土）', 6, '13:00', '17:30', 10, 'regular');
