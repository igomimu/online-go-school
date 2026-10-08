-- 講座の販売と視聴（online.mimura15.jp/course/）
-- 2026-10-09: Systeme.io をやめ、石の形講座をここで売る。tasks/course-sales-plan.md
-- 既存の表には触れない。RLS を有効にしてポリシーを置かない＝ブラウザからは読めず、
-- サービスロールの Vercel 関数（api/course-*.ts）だけが読み書きする。

create table if not exists public.course_products (
  id          text primary key,                 -- 'sakare', 'nimoku'（URL にも使う）
  title       text not null,
  subtitle    text,
  price_jpy   integer not null check (price_jpy > 0),
  video_key   text,                             -- R2 course-videos のオブジェクト名。null なら準備中
  minutes     integer,
  sort_order  integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.course_purchases (
  id                 uuid primary key default gen_random_uuid(),
  product_id         text not null references public.course_products(id),
  email              text not null,
  access_token_hash  text not null unique,      -- 視聴リンクの鍵の SHA-256。鍵そのものは置かない
  stripe_session_id  text unique,               -- 手動で付けた分（既存の購入者）は null
  source             text not null check (source in ('stripe_test', 'stripe_live', 'manual')),
  amount_jpy         integer,
  email_sent_at      timestamptz,
  revoked_at         timestamptz,
  created_at         timestamptz not null default now()
);

create index if not exists course_purchases_email_idx on public.course_purchases (lower(email));

alter table public.course_products  enable row level security;
alter table public.course_purchases enable row level security;

insert into public.course_products (id, title, subtitle, price_jpy, video_key, minutes, sort_order) values
  ('sakare', '第1回 裂かれ形', '石が弱くなるしくみと、実戦でよく出る裂かれ形', 3000, null, 47, 1),
  ('nimoku', '第2回 2目の頭', '「2目の頭は見ずハネよ」を13テーマで', 3000, 'nimoku.mp4', 43, 2)
on conflict (id) do nothing;
