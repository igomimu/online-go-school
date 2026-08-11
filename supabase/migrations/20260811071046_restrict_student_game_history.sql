-- 生徒の保存棋譜閲覧を本人が黒番・白番の棋譜だけに制限する。
-- student_id は custom_access_token_hook によりJWTのトップレベルclaimへ昇格済み。

DROP POLICY IF EXISTS select_games ON public.go_school_games;

CREATE POLICY select_games ON public.go_school_games
    FOR SELECT
    TO authenticated
    USING (
        (SELECT auth.jwt() ->> 'app_role') = 'teacher'
        OR (
            (SELECT auth.jwt() ->> 'app_role') = 'student'
            AND NULLIF((SELECT auth.jwt() ->> 'student_id'), '') IS NOT NULL
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
        )
    );

CREATE INDEX IF NOT EXISTS go_school_games_black_player_idx
    ON public.go_school_games (black_player);

CREATE INDEX IF NOT EXISTS go_school_games_white_player_idx
    ON public.go_school_games (white_player);
