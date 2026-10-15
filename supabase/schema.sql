-- MacroLog: 友達グループ内でバーコード商品を共有するためのテーブル
-- Supabase の SQL Editor に貼り付けて「Run」してください（1回だけ）。
--
-- 仕組み：ログインは使わず、「招待コード」を知っている人だけがそのグループの行を読み書きできる。
-- アプリはリクエストヘッダー x-group-code に招待コードを付けて送り、RLS でヘッダーと一致する行だけ許可する。
-- 招待コードを知らない人は、他グループの行を読むことも一覧することもできない。

create table if not exists public.shared_foods (
  group_code  text not null check (char_length(group_code) between 12 and 40),
  barcode     text not null check (barcode ~ '^[0-9]{8,14}$'),
  name        text not null check (char_length(name) between 1 and 80),
  kcal        real not null check (kcal between 0 and 5000),
  p           real not null check (p between 0 and 500),
  f           real not null check (f between 0 and 500),
  c           real not null check (c between 0 and 1000),
  basis       text not null default 'serving' check (basis in ('serving', '100g')),
  unit_label  text check (char_length(unit_label) <= 30),
  unit_g      real check (unit_g is null or (unit_g > 0 and unit_g <= 5000)),
  added_by    text check (char_length(added_by) <= 20),
  updated_at  timestamptz not null default now(),
  primary key (group_code, barcode)
);

alter table public.shared_foods enable row level security;

-- リクエストヘッダーから招待コードを取り出す
create or replace function public.request_group_code() returns text
language sql stable
as $$
  select coalesce(current_setting('request.headers', true)::json ->> 'x-group-code', '')
$$;

drop policy if exists "group members can read" on public.shared_foods;
create policy "group members can read" on public.shared_foods
  for select to anon
  using (group_code = public.request_group_code());

drop policy if exists "group members can insert" on public.shared_foods;
create policy "group members can insert" on public.shared_foods
  for insert to anon
  with check (group_code = public.request_group_code());

drop policy if exists "group members can update" on public.shared_foods;
create policy "group members can update" on public.shared_foods
  for update to anon
  using (group_code = public.request_group_code())
  with check (group_code = public.request_group_code());

revoke all on public.shared_foods from anon;
grant select, insert, update on public.shared_foods to anon;
