-- ==========================================
-- 039: 集中特訓変更時に過去の参加日を保持する
--
-- 034 の update_training_registration は「過去日の reservations は触らない」
-- という設計だが、入力 p_dates に過去日が含まれると一律拒否していた。
-- 開催期間の途中で変更する場合、既存申込には過去日が含まれるため、
-- 既存の過去日だけは保持し、未来日だけ差し替える。
-- ==========================================

CREATE OR REPLACE FUNCTION update_training_registration(
  p_reg_id UUID,
  p_course TEXT,
  p_dates TEXT[]
) RETURNS event_registrations AS $$
DECLARE
  v_reg event_registrations;
  v_event events;
  v_class_id UUID;
  v_class_name TEXT;
  v_role TEXT;
  v_today DATE := CURRENT_DATE;
  v_valid_dates TEXT[];
  v_invalid_dates TEXT[];
  v_past_dates TEXT[];
  v_old_past_dates TEXT[];
  v_future_old_dates TEXT[];
  v_next_dates TEXT[];
  v_d TEXT;
BEGIN
  SELECT * INTO v_reg FROM event_registrations WHERE id = p_reg_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '申込が見つかりません';
  END IF;

  v_role := get_user_role();
  IF v_role NOT IN ('admin', 'staff') AND NOT is_parent_of_student(v_reg.student_id) THEN
    RAISE EXCEPTION 'この申込を変更する権限がありません';
  END IF;

  IF v_reg.status = 'cancelled' THEN
    RAISE EXCEPTION 'キャンセル済みの申込は変更できません';
  END IF;

  IF p_course IS NULL OR p_course NOT IN ('A', 'B') THEN
    RAISE EXCEPTION 'コースは A または B を指定してください';
  END IF;
  IF p_dates IS NULL OR array_length(p_dates, 1) IS NULL THEN
    RAISE EXCEPTION '参加日を1日以上選んでください';
  END IF;

  SELECT * INTO v_event FROM events WHERE id = v_reg.event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'イベントが見つかりません';
  END IF;

  SELECT array_agg(item->>'date')
    INTO v_valid_dates
    FROM jsonb_array_elements(COALESCE(v_event.training_dates, '[]'::jsonb)) AS item;

  IF v_valid_dates IS NULL OR array_length(v_valid_dates, 1) IS NULL THEN
    RAISE EXCEPTION 'このイベントは集中特訓ではありません';
  END IF;

  SELECT array_agg(d) INTO v_invalid_dates
    FROM unnest(p_dates) AS input_dates(d)
    WHERE NOT (d = ANY(v_valid_dates));
  IF v_invalid_dates IS NOT NULL AND array_length(v_invalid_dates, 1) > 0 THEN
    RAISE EXCEPTION '無効な日付が含まれています: %', array_to_string(v_invalid_dates, ', ');
  END IF;

  SELECT array_agg(d) INTO v_old_past_dates
    FROM unnest(COALESCE(v_reg.selected_dates, ARRAY[]::TEXT[])) AS old_dates(d)
    WHERE d::DATE < v_today;

  -- 新規に過去日を追加することは拒否。既存申込に含まれていた過去日だけ保持可。
  SELECT array_agg(d) INTO v_past_dates
    FROM unnest(p_dates) AS input_dates(d)
    WHERE d::DATE < v_today
      AND NOT (d = ANY(COALESCE(v_old_past_dates, ARRAY[]::TEXT[])));
  IF v_past_dates IS NOT NULL AND array_length(v_past_dates, 1) > 0 THEN
    RAISE EXCEPTION '過去日には変更できません: %', array_to_string(v_past_dates, ', ');
  END IF;

  SELECT ARRAY(
    SELECT DISTINCT d
    FROM (
      SELECT unnest(COALESCE(v_old_past_dates, ARRAY[]::TEXT[])) AS d
      UNION ALL
      SELECT d FROM unnest(p_dates) AS input_dates(d) WHERE d::DATE >= v_today
    ) AS merged
    ORDER BY d
  ) INTO v_next_dates;

  IF v_next_dates IS NULL OR array_length(v_next_dates, 1) IS NULL THEN
    RAISE EXCEPTION '参加日を1日以上選んでください';
  END IF;

  v_class_name := v_event.name || ' ' || p_course || 'コース';
  SELECT id INTO v_class_id FROM classes
    WHERE name = v_class_name AND class_type = 'event';
  IF v_class_id IS NULL THEN
    RAISE EXCEPTION '対応するクラスが見つかりません: %', v_class_name;
  END IF;

  SELECT array_agg(d) INTO v_future_old_dates
    FROM unnest(COALESCE(v_reg.selected_dates, ARRAY[]::TEXT[])) AS old_dates(d)
    WHERE d::DATE >= v_today;

  IF v_future_old_dates IS NOT NULL AND array_length(v_future_old_dates, 1) > 0 THEN
    UPDATE reservations
      SET status = 'cancelled'
      WHERE event_registration_id = p_reg_id
        AND date::TEXT = ANY(v_future_old_dates);
  END IF;

  FOREACH v_d IN ARRAY v_next_dates
  LOOP
    IF v_d::DATE >= v_today THEN
      INSERT INTO reservations (
        student_id, class_id, date, status, created_by,
        is_transfer, reservation_type, event_registration_id
      ) VALUES (
        v_reg.student_id, v_class_id, v_d::DATE, 'confirmed', v_reg.registered_by,
        false, 'additional', p_reg_id
      );
    END IF;
  END LOOP;

  UPDATE event_registrations
    SET course = p_course,
        selected_dates = v_next_dates
    WHERE id = p_reg_id
    RETURNING * INTO v_reg;

  RETURN v_reg;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION update_training_registration(UUID, TEXT, TEXT[]) TO authenticated;
