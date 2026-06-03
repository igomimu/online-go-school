-- ==========================================
-- 034: 予約変更を一級操作にする
-- スポット予約・振替予約・GW集中特訓申込を「キャンセル+再作成」ではなく UPDATE で変更可能にする。
-- どちらも SECURITY DEFINER で実装し、保護者は自分の子供分のみ編集可。
-- ==========================================

-- ─────────────────────────────────────────────
-- 共通ヘルパー: 保護者が当該生徒の親かを判定
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION is_parent_of_student(p_student_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM students
    WHERE id = p_student_id AND parent_profile_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─────────────────────────────────────────────
-- update_reservation: スポット予約・振替予約の変更
-- ─────────────────────────────────────────────
-- 仕様:
--   - status='cancelled' / event_registration_id IS NOT NULL は拒否
--   - 旧日付・新日付ともに今日以降（過去の出席記録との整合性を壊さない）
--   - スポット予約: class_id, date 両方変更可
--   - 振替予約: class_id, date を変更可。original_*, absence_report_id は不変
--   - 定員チェック: class_enrollments + 当日 confirmed reservations - 自分自身 < capacity
--   - 同一生徒・同一クラス・同一日付の他active予約があれば拒否（UNIQUE 制約と整合）
--   - SECURITY DEFINER + 親チェック内蔵でRLS無関係に動作
CREATE OR REPLACE FUNCTION update_reservation(
  p_id UUID,
  p_class_id UUID,
  p_date DATE
) RETURNS reservations AS $$
DECLARE
  v_res reservations;
  v_capacity INT;
  v_enroll_count INT;
  v_reserve_count INT;
  v_dup_count INT;
  v_role TEXT;
BEGIN
  -- 既存予約をロック取得
  SELECT * INTO v_res FROM reservations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '予約が見つかりません';
  END IF;

  -- 権限チェック: スタッフ・管理者 OR 保護者本人
  v_role := get_user_role();
  IF v_role NOT IN ('admin', 'staff') AND NOT is_parent_of_student(v_res.student_id) THEN
    RAISE EXCEPTION 'この予約を変更する権限がありません';
  END IF;

  -- ステータスチェック
  IF v_res.status = 'cancelled' THEN
    RAISE EXCEPTION 'キャンセル済みの予約は変更できません';
  END IF;

  -- 集中特訓由来の予約は専用RPC経由
  IF v_res.event_registration_id IS NOT NULL THEN
    RAISE EXCEPTION '集中特訓の予約は専用の変更操作を使ってください';
  END IF;

  -- 過去日ガード（旧・新の双方）
  IF v_res.date < CURRENT_DATE THEN
    RAISE EXCEPTION '過去の予約は変更できません';
  END IF;
  IF p_date < CURRENT_DATE THEN
    RAISE EXCEPTION '過去の日付には変更できません';
  END IF;

  -- 定員チェック（自分自身は除外）
  SELECT capacity INTO v_capacity FROM classes WHERE id = p_class_id;
  IF v_capacity IS NULL THEN
    RAISE EXCEPTION '指定されたクラスが存在しません';
  END IF;

  SELECT COUNT(*) INTO v_enroll_count FROM class_enrollments WHERE class_id = p_class_id;
  SELECT COUNT(*) INTO v_reserve_count FROM reservations
    WHERE class_id = p_class_id
      AND date = p_date
      AND status = 'confirmed'
      AND id <> p_id;

  IF (v_enroll_count + v_reserve_count) >= v_capacity THEN
    RAISE EXCEPTION '変更先のクラスは定員に達しています';
  END IF;

  -- 同一(student, class, date) の他active予約がないか
  SELECT COUNT(*) INTO v_dup_count FROM reservations
    WHERE student_id = v_res.student_id
      AND class_id = p_class_id
      AND date = p_date
      AND status <> 'cancelled'
      AND id <> p_id;
  IF v_dup_count > 0 THEN
    RAISE EXCEPTION '同じクラス・日付に既に予約があります';
  END IF;

  -- 更新
  UPDATE reservations
    SET class_id = p_class_id,
        date = p_date
    WHERE id = p_id
    RETURNING * INTO v_res;

  RETURN v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────
-- update_training_registration: GW集中特訓の変更
-- ─────────────────────────────────────────────
-- 仕様:
--   - course / selected_dates を同時に変更可
--   - reservations は全件 cancelled → 新dates で再INSERT（id は変わるが attendance は (student,class,date) で参照されるため整合）
--   - 過去日（旧 selected_dates のうち今日より前）は変更前のまま（cancel しない・再INSERTしない）
--     → 既に出席済みの過去日には触らない
--   - 新 selected_dates のうち過去日は弾く
--   - capacity チェックは入れない（既存 registerForTraining と対称、外部参加者ハードコードで既に超過の可能性あり）
--   - SECURITY DEFINER + 親チェック内蔵
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
  v_future_old_dates TEXT[];
  v_d TEXT;
BEGIN
  -- 既存登録をロック取得
  SELECT * INTO v_reg FROM event_registrations WHERE id = p_reg_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '申込が見つかりません';
  END IF;

  -- 権限チェック
  v_role := get_user_role();
  IF v_role NOT IN ('admin', 'staff') AND NOT is_parent_of_student(v_reg.student_id) THEN
    RAISE EXCEPTION 'この申込を変更する権限がありません';
  END IF;

  IF v_reg.status = 'cancelled' THEN
    RAISE EXCEPTION 'キャンセル済みの申込は変更できません';
  END IF;

  -- 入力バリデーション
  IF p_course IS NULL OR p_course NOT IN ('A', 'B') THEN
    RAISE EXCEPTION 'コースは A または B を指定してください';
  END IF;
  IF p_dates IS NULL OR array_length(p_dates, 1) IS NULL THEN
    RAISE EXCEPTION '参加日を1日以上選んでください';
  END IF;

  -- イベント取得 + training_dates から有効日付一覧を抽出
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

  -- 不正な日付がないか
  SELECT array_agg(d) INTO v_invalid_dates
    FROM unnest(p_dates) AS d
    WHERE NOT (d = ANY(v_valid_dates));
  IF v_invalid_dates IS NOT NULL AND array_length(v_invalid_dates, 1) > 0 THEN
    RAISE EXCEPTION '無効な日付が含まれています: %', array_to_string(v_invalid_dates, ', ');
  END IF;

  -- 新dates のうち過去日は弾く
  SELECT array_agg(d) INTO v_past_dates
    FROM unnest(p_dates) AS d
    WHERE d::DATE < v_today;
  IF v_past_dates IS NOT NULL AND array_length(v_past_dates, 1) > 0 THEN
    RAISE EXCEPTION '過去日には変更できません: %', array_to_string(v_past_dates, ', ');
  END IF;

  -- クラス解決
  v_class_name := v_event.name || ' ' || p_course || 'コース';
  SELECT id INTO v_class_id FROM classes
    WHERE name = v_class_name AND class_type = 'event';
  IF v_class_id IS NULL THEN
    RAISE EXCEPTION '対応するクラスが見つかりません: %', v_class_name;
  END IF;

  -- 旧 selected_dates のうち今日以降のものだけを cancelled 対象とする
  -- （過去日の reservations は触らない＝出席記録を保護）
  SELECT array_agg(d) INTO v_future_old_dates
    FROM unnest(COALESCE(v_reg.selected_dates, ARRAY[]::TEXT[])) AS d
    WHERE d::DATE >= v_today;

  IF v_future_old_dates IS NOT NULL AND array_length(v_future_old_dates, 1) > 0 THEN
    UPDATE reservations
      SET status = 'cancelled'
      WHERE event_registration_id = p_reg_id
        AND date::TEXT = ANY(v_future_old_dates);
  END IF;

  -- 新 dates で reservations を作成（過去日は除外）
  FOREACH v_d IN ARRAY p_dates
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

  -- event_registrations を UPDATE
  UPDATE event_registrations
    SET course = p_course,
        selected_dates = p_dates
    WHERE id = p_reg_id
    RETURNING * INTO v_reg;

  RETURN v_reg;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 権限付与（authenticated ユーザーが呼び出し可能）
GRANT EXECUTE ON FUNCTION update_reservation(UUID, UUID, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION update_training_registration(UUID, TEXT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION is_parent_of_student(UUID) TO authenticated;
