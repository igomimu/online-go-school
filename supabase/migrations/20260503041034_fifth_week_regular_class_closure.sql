-- 第5週（29日以降）は通常クラスを休みにする。
-- 集中特訓など event クラスは対象外。道場生の「道場生」クラスだけは通常通り扱う。

CREATE OR REPLACE FUNCTION public.is_fifth_week_date(p_date DATE)
RETURNS BOOLEAN AS $$
  SELECT EXTRACT(DAY FROM p_date)::INT >= 29;
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION public.enforce_fifth_week_regular_class_closure()
RETURNS TRIGGER AS $$
DECLARE
  v_student_type TEXT;
  v_class_name TEXT;
  v_class_type TEXT;
BEGIN
  IF NEW.status = 'cancelled' OR NEW.date IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_fifth_week_date(NEW.date) THEN
    RETURN NEW;
  END IF;

  SELECT student_type INTO v_student_type
  FROM public.students
  WHERE id = NEW.student_id;

  SELECT name, class_type INTO v_class_name, v_class_type
  FROM public.classes
  WHERE id = NEW.class_id;

  IF v_class_type = 'event' THEN
    RETURN NEW;
  END IF;

  IF v_student_type = 'dojo' AND v_class_name LIKE '道場生%' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION '第5週は通常クラスがお休みです';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_fifth_week_regular_class_closure ON public.reservations;
CREATE TRIGGER trg_enforce_fifth_week_regular_class_closure
  BEFORE INSERT OR UPDATE OF student_id, class_id, date, status ON public.reservations
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_fifth_week_regular_class_closure();
