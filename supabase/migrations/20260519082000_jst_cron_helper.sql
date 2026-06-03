-- JST直書きで pg_cron をスケジュールできるヘルパー関数と、既存3jobsの再schedule。
-- 目的: migration の schedule 表記を「JST朝8時」と人が読める形にして、UTC換算ミスを構造的に防ぐ。

CREATE OR REPLACE FUNCTION public.jst_cron(jst_expr text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  parts text[];
  hour_jst int;
  hour_utc int;
BEGIN
  parts := string_to_array(jst_expr, ' ');
  IF array_length(parts, 1) != 5 THEN
    RAISE EXCEPTION 'JST cron must be 5 fields (m h dom mon dow): %', jst_expr;
  END IF;
  IF parts[2] !~ '^\d+$' THEN
    RAISE EXCEPTION 'JST hour field must be a single integer 0-23: %', jst_expr;
  END IF;
  hour_jst := parts[2]::int;
  IF hour_jst < 0 OR hour_jst > 23 THEN
    RAISE EXCEPTION 'JST hour out of range 0-23: %', jst_expr;
  END IF;
  hour_utc := (hour_jst - 9 + 24) % 24;
  parts[2] := hour_utc::text;
  -- JST 0〜8時は UTC前日にズレる。day/dow指定があると曜日がズレるので拒否する。
  IF hour_jst < 9 AND (parts[3] != '*' OR parts[5] != '*') THEN
    RAISE EXCEPTION 'JST cron crosses day boundary (hour < 9 with day/dow filter); specify in UTC manually: %', jst_expr;
  END IF;
  RETURN array_to_string(parts, ' ');
END;
$$;

-- 既存ジョブの command を保持したまま、schedule のみ JST 直書き表記で再登録する。
-- dev/staging で対象ジョブが存在しなければ何もしない (idempotent)。
DO $$
DECLARE
  cmd_daily text;
  cmd_mismatch text;
BEGIN
  SELECT command INTO cmd_daily   FROM cron.job WHERE jobname = 'notify-daily-reservations';
  SELECT command INTO cmd_mismatch FROM cron.job WHERE jobname = 'notify-reservation-mismatch';

  IF cmd_daily IS NOT NULL THEN
    PERFORM cron.unschedule('notify-daily-reservations');
    PERFORM cron.schedule(
      'notify-daily-reservations',
      public.jst_cron('0 8 * * *'),  -- JST 朝8:00: n日朝にn日の参加予定を通知
      cmd_daily
    );
  END IF;

  IF cmd_mismatch IS NOT NULL THEN
    PERFORM cron.unschedule('notify-reservation-mismatch');
    PERFORM cron.schedule(
      'notify-reservation-mismatch',
      public.jst_cron('5 9 * * *'),  -- JST 朝9:05: 整合性監査
      cmd_mismatch
    );
  END IF;
END $$;
