-- ---------- RLS 有効化 ----------
ALTER TABLE public.go_school_live_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.go_school_live_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.go_school_games ENABLE ROW LEVEL SECURITY;

-- ---------- go_school_live_games ポリシー ----------
DROP POLICY IF EXISTS select_live_games ON public.go_school_live_games;
CREATE POLICY select_live_games ON public.go_school_live_games 
    FOR SELECT 
    USING (
        auth.jwt()->>'app_role' = 'teacher' OR 
        auth.jwt()->>'classroom_id' = classroom_id
    );

-- 書き込み（INSERT/UPDATE/DELETE）はポリシーを設定しないことで、
-- service_role 以外のすべての直接書き込みを完全に拒否する。

-- ---------- go_school_live_moves ポリシー ----------
DROP POLICY IF EXISTS select_live_moves ON public.go_school_live_moves;
CREATE POLICY select_live_moves ON public.go_school_live_moves 
    FOR SELECT 
    USING (
        auth.jwt()->>'app_role' = 'teacher' OR
        EXISTS (
            SELECT 1 FROM public.go_school_live_games g 
            WHERE g.id = game_id 
            AND g.classroom_id = auth.jwt()->>'classroom_id'
        )
    );

-- 書き込みは同様に完全拒否。

-- ---------- go_school_games ポリシー ----------
DROP POLICY IF EXISTS "Allow all for service role" ON public.go_school_games;
DROP POLICY IF EXISTS select_games ON public.go_school_games;
DROP POLICY IF EXISTS modify_games ON public.go_school_games;

-- 閲覧: 先生、または認証された所属生徒
CREATE POLICY select_games ON public.go_school_games 
    FOR SELECT 
    USING (
        auth.jwt()->>'app_role' = 'teacher' OR 
        auth.jwt()->>'classroom_id' IS NOT NULL
    );

-- 変更: 先生のみ直接操作を許可
CREATE POLICY modify_games ON public.go_school_games 
    FOR ALL 
    USING (
        auth.jwt()->>'app_role' = 'teacher'
    )
    WITH CHECK (
        auth.jwt()->>'app_role' = 'teacher'
    );
