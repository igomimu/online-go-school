-- 道場の共有PC用。名前を選ぶだけで入れる画面を開くための鍵（2026-08-13 三村さん）。
-- 教室IDだけで氏名一覧が引けると個人情報が漏れるので、別のトークンを立てる。
alter table public.go_school_classrooms
  add column if not exists roster_token text;

update public.go_school_classrooms
set roster_token = encode(gen_random_bytes(12), 'hex')
where roster_token is null;

-- 新しく作った教室にも自動で入るようにする
alter table public.go_school_classrooms
  alter column roster_token set default encode(gen_random_bytes(12), 'hex');

create unique index if not exists go_school_classrooms_roster_token_key
  on public.go_school_classrooms (roster_token)
  where roster_token is not null;

comment on column public.go_school_classrooms.roster_token is
  '道場の共有PC用リンクの鍵。これを知っている端末だけが名簿（氏名と4桁コード）を取得できる';
