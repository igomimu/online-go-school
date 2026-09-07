-- ============================================================
-- 生徒が自分の棋譜を持ち込めるようにする（SGFのアップロード／盤に並べて保存）
-- ============================================================
-- 2026-09-07 三村さん「棋譜をアップロードする機能と、アプリ内に棋譜を入力して
-- 保存する機能を作る」。使えるのは先生と生徒の両方。
--
-- go_school_games への書き込みは、これまで modify_games（app_role='teacher'）だけが
-- 通っていた。生徒の持込ぶんだけを、次の条件をすべて満たす行に限って開ける。
--
--   * app_role='student' で student_id claim があること
--   * source が 'live' でないこと（アプリで打った対局の記録は名乗れない）
--   * created_by が自分であること
--   * 黒番か白番のどちらかが自分であること（他人の棋譜は作れない）
--
-- student_id / app_role は app_metadata 由来の claim（20260907090000）で、
-- app_metadata は service_role でしか書けない＝利用者側から詐称できない。
--
-- 閲覧の制限（20260811163000: 生徒は自分が対局者の棋譜だけ）はそのまま。
-- ポリシーは OR で足されるため、先生の modify_games にも影響しない。
-- ============================================================

ALTER TABLE public.go_school_games
    ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'live';

ALTER TABLE public.go_school_games
    ADD COLUMN IF NOT EXISTS created_by text;

COMMENT ON COLUMN public.go_school_games.source IS
    'live=アプリで打った対局 / upload=SGFファイルの持込 / manual=盤に並べて入力';
COMMENT ON COLUMN public.go_school_games.created_by IS
    '持込棋譜を入れた人の identity（sid:1010 等）。対局の記録では NULL';

-- 生徒が自分の持込棋譜を入れる
DROP POLICY IF EXISTS insert_own_brought_games ON public.go_school_games;
CREATE POLICY insert_own_brought_games ON public.go_school_games
    FOR INSERT
    TO authenticated
    WITH CHECK (
        (SELECT auth.jwt() ->> 'app_role') = 'student'
        AND NULLIF((SELECT auth.jwt() ->> 'student_id'), '') IS NOT NULL
        AND source IN ('upload', 'manual')
        AND created_by = 'sid:' || (SELECT auth.jwt() ->> 'student_id')
        AND (
            black_player IN (
                (SELECT auth.jwt() ->> 'student_id'),
                'sid:' || (SELECT auth.jwt() ->> 'student_id')
            )
            OR white_player IN (
                (SELECT auth.jwt() ->> 'student_id'),
                'sid:' || (SELECT auth.jwt() ->> 'student_id')
            )
        )
    );

-- 読み違えたファイルを本人が消せるようにする。
-- 消せるのは自分が入れた持込棋譜だけで、対局の記録（source='live'）には触れない。
DROP POLICY IF EXISTS delete_own_brought_games ON public.go_school_games;
CREATE POLICY delete_own_brought_games ON public.go_school_games
    FOR DELETE
    TO authenticated
    USING (
        (SELECT auth.jwt() ->> 'app_role') = 'student'
        AND NULLIF((SELECT auth.jwt() ->> 'student_id'), '') IS NOT NULL
        AND source IN ('upload', 'manual')
        AND created_by = 'sid:' || (SELECT auth.jwt() ->> 'student_id')
    );
