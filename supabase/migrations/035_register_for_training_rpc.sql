-- ==========================================
-- 035: register_for_training RPC
-- 集中特訓の新規申込を「event_registrations + reservations 同時作成」の1トランザクションに統合する。
-- 旧フロー（クライアント側 INSERT 2回 + 失敗時 delete によるロールバック）は途中失敗で
-- event_registrations だけ残るバグを生んでいたため廃止する。
-- 哲学: 予約を確実に受け取る / 存在しない予約を勝手に作らない（バックフィル禁止）。
-- ==========================================

CREATE OR REPLACE FUNCTION register_for_training(
  p_event_id UUID,
  p_student_id UUID,
  p_course TEXT,
  p_dates TEXT[]
) RETURNS event_registrations AS $$
DECLARE
  v_event events;
  v_class_id UUID;
  v_class_name TEXT;
  v_role TEXT;
  v_today DATE := CURRENT_DATE;
  v_valid_dates TEXT[];
  v_invalid_dates TEXT[];
  v_past_dates TEXT[];
  v_existing UUID;
  v_reg event_registrations;
  v_actor UUID;
  v_d TEXT;
BEGIN
  v_actor := auth.uid();

  -- 権限チェック
  v_role := get_user_role();
  IF v_role NOT IN ('admin', 'staff') AND NOT is_parent_of_student(p_student_id) THEN
    RAISE EXCEPTION 'この生徒の申込を行う権限がありません';
  END IF;

  -- 入力検証
  IF p_course IS NULL OR p_course NOT IN ('A', 'B') THEN
    RAISE EXCEPTION 'コースは A または B を指定してください';
  END IF;
  IF p_dates IS NULL OR array_length(p_dates, 1) IS NULL THEN
    RAISE EXCEPTION '参加日を1日以上選んでください';
  END IF;

  -- イベント取得
  SELECT * INTO v_event FROM events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'イベントが見つかりません';
  END IF;

  -- 有効日付の抽出
  SELECT array_agg(item->>'date')
    INTO v_valid_dates
    FROM jsonb_array_elements(COALESCE(v_event.training_dates, '[]'::jsonb)) AS item;

  IF v_valid_dates IS NULL OR array_length(v_valid_dates, 1) IS NULL THEN
    RAISE EXCEPTION 'このイベントは集中特訓ではありません';
  END IF;

  -- 不正な日付
  SELECT array_agg(d) INTO v_invalid_dates
    FROM unnest(p_dates) AS d
    WHERE NOT (d = ANY(v_valid_dates));
  IF v_invalid_dates IS NOT NULL AND array_length(v_invalid_dates, 1) > 0 THEN
    RAISE EXCEPTION '無効な日付が含まれています: %', array_to_string(v_invalid_dates, ', ');
  END IF;

  -- 過去日は弾く
  SELECT array_agg(d) INTO v_past_dates
    FROM unnest(p_dates) AS d
    WHERE d::DATE < v_today;
  IF v_past_dates IS NOT NULL AND array_length(v_past_dates, 1) > 0 THEN
    RAISE EXCEPTION '過去日には申込できません: %', array_to_string(v_past_dates, ', ');
  END IF;

  -- 既存 registered があれば拒否
  SELECT id INTO v_existing FROM event_registrations
    WHERE event_id = p_event_id
      AND student_id = p_student_id
      AND status = 'registered'
    LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'すでに申込済みです（変更は変更操作を使ってください）';
  END IF;

  -- クラス解決
  v_class_name := v_event.name || ' ' || p_course || 'コース';
  SELECT id INTO v_class_id FROM classes
    WHERE name = v_class_name AND class_type = 'event';
  IF v_class_id IS NULL THEN
    RAISE EXCEPTION '対応するクラスが見つかりません: %', v_class_name;
  END IF;

  -- event_registrations INSERT
  INSERT INTO event_registrations (
    event_id, student_id, registered_by, status, course, selected_dates
  ) VALUES (
    p_event_id, p_student_id, v_actor, 'registered', p_course, p_dates
  ) RETURNING * INTO v_reg;

  -- reservations INSERT（同一トランザクション内、片方失敗で全てロールバック）
  FOREACH v_d IN ARRAY p_dates
  LOOP
    INSERT INTO reservations (
      student_id, class_id, date, status, created_by,
      is_transfer, reservation_type, event_registration_id
    ) VALUES (
      p_student_id, v_class_id, v_d::DATE, 'confirmed', v_actor,
      false, 'additional', v_reg.id
    );
  END LOOP;

  RETURN v_reg;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION register_for_training(UUID, UUID, TEXT, TEXT[]) TO authenticated;
