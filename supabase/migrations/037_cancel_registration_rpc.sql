-- ==========================================
-- 037: cancel_registration RPC
--
-- 集中特訓・通常イベントの申込みキャンセルを atomic 化する。
-- 旧フロー（クライアント側で reservations と event_registrations を順次 update）は
-- 途中失敗で片方だけ cancel される非atomic 構造のバグを抱えていた。
--
-- 哲学: 「予約を確実に受け取る・存在しない予約を勝手に作らない」を、キャンセル経路にも適用する。
-- ==========================================

CREATE OR REPLACE FUNCTION cancel_registration(p_reg_id UUID)
RETURNS event_registrations AS $$
DECLARE
  v_reg event_registrations;
  v_role TEXT;
  v_today DATE := CURRENT_DATE;
BEGIN
  SELECT * INTO v_reg FROM event_registrations WHERE id = p_reg_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '申込みが見つかりません';
  END IF;

  IF v_reg.status = 'cancelled' THEN
    RETURN v_reg;
  END IF;

  v_role := get_user_role();
  IF v_role NOT IN ('admin', 'staff') AND NOT is_parent_of_student(v_reg.student_id) THEN
    RAISE EXCEPTION 'このキャンセルを行う権限がありません';
  END IF;

  -- 紐付く未来日の reservations を cancel（過去日は出席記録保護のため触らない）
  UPDATE reservations
    SET status = 'cancelled'
    WHERE event_registration_id = p_reg_id
      AND date >= v_today
      AND status = 'confirmed';

  -- event_registrations を cancel → notify-event-registration の UPDATE 経路で
  -- 1通のキャンセル通知が保護者に届く（reservations 側は event_registration_id が
  -- セットされているので notify-reservation 側は skip される＝N通の重複は出ない）
  UPDATE event_registrations
    SET status = 'cancelled'
    WHERE id = p_reg_id
    RETURNING * INTO v_reg;

  RETURN v_reg;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION cancel_registration(UUID) TO authenticated;
