-- パスワードリセット画面で未登録メールを検知するための関数
-- auth.users は RLS 外のため SECURITY DEFINER で安全に参照する
CREATE OR REPLACE FUNCTION public.check_email_registered(check_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM auth.users
    WHERE email = check_email
      AND deleted_at IS NULL
  );
END;
$$;

-- 認証不要で呼び出せるよう anon にも付与（ログイン前の画面から使うため）
GRANT EXECUTE ON FUNCTION public.check_email_registered(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.check_email_registered(TEXT) TO authenticated;
