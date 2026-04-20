-- ============================================================
-- handle_new_user() トリガー: Anonymous user を profiles 挿入から除外
-- ============================================================
-- 背景: dojo-app の handle_new_user() は auth.users への insert 時に
-- 必ず public.profiles へ insert するため、online-go-school の Anonymous
-- Sign-In で作られる anon user（email 空）で制約違反が発生し、auth 全体が
-- 500 を返す事象があった（2026-04-20）。
--
-- 改修: NEW.is_anonymous = true の場合は profiles 挿入をスキップする。
-- online-go-school の生徒は独立認証（JWT claim ベース）なので profiles
-- テーブル経由のロール解決は不要。dojo-app の保護者・スタッフは従来通り
-- Magic Link で profiles が作成される。
--
-- 影響範囲:
--   - dojo-app: 影響なし（Magic Link signup は is_anonymous=false で通常動作）
--   - online-go-school: Anonymous Sign-In が通るようになる
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
as $$
begin
    -- online-go-school の Anonymous Sign-In で作成される anon ユーザーは
    -- profiles に入れない（独立認証で不要、かつ email 空で制約違反になる）
    if new.is_anonymous then
        return new;
    end if;

    insert into public.profiles (id, email, display_name, role)
    values (
        new.id,
        new.email,
        coalesce(
            new.raw_user_meta_data->>'display_name',
            new.raw_user_meta_data->>'full_name',
            new.raw_user_meta_data->>'name',
            split_part(new.email, '@', 1)
        ),
        coalesce(new.raw_user_meta_data->>'role', 'parent')
    );
    return new;
end;
$$;
