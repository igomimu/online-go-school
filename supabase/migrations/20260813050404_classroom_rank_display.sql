-- 教室ごとに棋力の見せ方を選べるようにする（2026-08-13 三村さん）
--   dan_kyu … 一般の大人向け。「初段」「3級」
--   rating  … 道場の生徒向け。「R12」（0が最強）
alter table public.go_school_classrooms
  add column if not exists rank_display text not null default 'dan_kyu'
  check (rank_display in ('dan_kyu', 'rating'));

comment on column public.go_school_classrooms.rank_display is
  '棋力の表示方法。dan_kyu=段級（初段・3級）/ rating=レーティング（R12）';

-- 既存の段級位を英字（1D / 3K）から日本語へ揃える。
-- 表示側にも読み替えを入れてあるが、データ自体も揃えておく。
update public.go_school_students
set rank = case
    when rank ~* '^([1-8])[DP]$' then
      (array['初','二','三','四','五','六','七','八'])[(regexp_replace(rank, '[^0-9]', '', 'g'))::int] || '段'
    when rank ~* '^([0-9]+)[DP]$' then regexp_replace(rank, '[^0-9]', '', 'g') || '段'
    when rank ~* '^([0-9]+)K$' then regexp_replace(rank, '[^0-9]', '', 'g') || '級'
    else rank
  end,
  updated_at = now()
where rank ~* '^[0-9]+[DKP]$';
