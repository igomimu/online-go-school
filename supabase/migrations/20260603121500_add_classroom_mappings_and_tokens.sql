-- ---------- go_school_classroom_mappings ----------
CREATE TABLE IF NOT EXISTS public.go_school_classroom_mappings (
    dojo_class_id       uuid NOT NULL PRIMARY KEY,
    online_classroom_id text NOT NULL,
    created_at          timestamptz DEFAULT now(),
    updated_at          timestamptz DEFAULT now(),
    CONSTRAINT go_school_classroom_mappings_dojo_class_id_fkey 
        FOREIGN KEY (dojo_class_id) REFERENCES public.classes(id) ON DELETE CASCADE
);

-- ---------- go_school_join_tokens ----------
CREATE TABLE IF NOT EXISTS public.go_school_join_tokens (
    token_hash          text NOT NULL PRIMARY KEY,
    student_id          uuid NOT NULL,
    online_classroom_id text NOT NULL,
    expires_at          timestamptz NOT NULL,
    used_at             timestamptz,
    issued_by           uuid,
    created_at          timestamptz DEFAULT now(),
    CONSTRAINT go_school_join_tokens_student_id_fkey 
        FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE
);

-- リアルタイム配信やRLSの設定のため、テーブルの権限を付与
GRANT ALL ON TABLE public.go_school_classroom_mappings TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.go_school_join_tokens TO anon, authenticated, service_role;
