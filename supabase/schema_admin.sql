-- KoyLao admin/backend schema — run this in the SQL Editor AFTER schema.sql.
-- Adds: canonical draw results, cloud-synced purchases, server-side
-- payout evaluation, and an admin role for the dashboard.

-- ============================================================
-- draws: canonical lottery results. Written by the fetch-draws
-- Edge Function (service role) or an admin; read by everyone,
-- including logged-out users, since results aren't sensitive.
-- ============================================================
create table if not exists public.draws (
  draw_date  date primary key,
  num        text not null,
  source     text not null default 'laodl',
  updated_at timestamptz not null default now()
);

alter table public.draws enable row level security;

drop policy if exists "draws_select_all" on public.draws;
create policy "draws_select_all"
  on public.draws for select
  using (true);

-- ============================================================
-- Admin flag on profiles, plus a SECURITY DEFINER helper so admin
-- policies below don't re-trigger RLS on profiles themselves.
-- ============================================================
alter table public.profiles add column if not exists is_admin boolean not null default false;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
  on public.profiles for select
  using (public.is_admin());

drop policy if exists "draws_write_admin" on public.draws;
create policy "draws_write_admin"
  on public.draws for all
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================
-- purchases: one row per "buy" transaction (a bill/receipt).
-- id is client-generated text (matches the app's local id format),
-- not a uuid, to avoid a client/server id-format mismatch.
-- ============================================================
create table if not exists public.purchases (
  id         text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  bill_no    text not null,
  ref_no     text not null,
  channel    text not null,
  draw_date  date not null,
  created_at timestamptz not null default now()
);

alter table public.purchases enable row level security;

drop policy if exists "purchases_select_own" on public.purchases;
create policy "purchases_select_own"
  on public.purchases for select
  using (auth.uid() = user_id);

drop policy if exists "purchases_insert_own" on public.purchases;
create policy "purchases_insert_own"
  on public.purchases for insert
  with check (auth.uid() = user_id);

drop policy if exists "purchases_select_admin" on public.purchases;
create policy "purchases_select_admin"
  on public.purchases for select
  using (public.is_admin());

-- No update/delete policy for the client: once made, a purchase is
-- a permanent receipt. Line status only changes via the
-- evaluate_my_purchases() function below.

-- ============================================================
-- purchase_lines: the individual numbers within a purchase.
-- ============================================================
do $$ begin
  create type public.line_status as enum ('pending', 'win', 'lose');
exception when duplicate_object then null;
end $$;

create table if not exists public.purchase_lines (
  id           uuid primary key default gen_random_uuid(),
  purchase_id  text not null references public.purchases(id) on delete cascade,
  num          text not null,
  amount       integer not null,
  status       public.line_status not null default 'pending',
  hit          integer,
  pay          integer,
  created_at   timestamptz not null default now()
);

alter table public.purchase_lines enable row level security;

drop policy if exists "purchase_lines_select_own" on public.purchase_lines;
create policy "purchase_lines_select_own"
  on public.purchase_lines for select
  using (exists (
    select 1 from public.purchases p
    where p.id = purchase_lines.purchase_id and p.user_id = auth.uid()
  ));

drop policy if exists "purchase_lines_insert_own" on public.purchase_lines;
create policy "purchase_lines_insert_own"
  on public.purchase_lines for insert
  with check (exists (
    select 1 from public.purchases p
    where p.id = purchase_lines.purchase_id and p.user_id = auth.uid()
  ));

drop policy if exists "purchase_lines_select_admin" on public.purchase_lines;
create policy "purchase_lines_select_admin"
  on public.purchase_lines for select
  using (public.is_admin());

-- ============================================================
-- Payout logic, mirroring src/utils/lottery.ts exactly so the
-- server and the app never disagree on who won or how much.
-- ============================================================
create or replace function public.check_number(user_num text, draw_num text)
returns integer
language plpgsql
immutable
as $$
declare
  n integer;
  max_n integer;
begin
  if user_num is null or draw_num is null or user_num = '' then
    return null;
  end if;
  max_n := least(length(user_num), 6);
  for n in reverse max_n..1 loop
    if right(user_num, n) = right(draw_num, n) then
      return n;
    end if;
  end loop;
  return null;
end;
$$;

create or replace function public.payout_for(hit integer, amount integer)
returns integer
language sql
immutable
as $$
  select case hit
    when 6 then round(amount / 1000.0 * 400000000)
    when 5 then round(amount / 1000.0 * 40000000)
    when 4 then round(amount / 1000.0 * 5000000)
    when 3 then round(amount / 1000.0 * 500000)
    when 2 then round(amount / 1000.0 * 60000)
    when 1 then round(amount / 1000.0 * 5000)
    else null
  end::integer;
$$;

-- Evaluates every pending line the CALLING user owns against
-- public.draws, marking each won or lost. SECURITY DEFINER so the
-- client can trigger it (via RPC) without an UPDATE grant on
-- purchase_lines directly — the only way a line's status can change.
create or replace function public.evaluate_my_purchases()
returns table (win_count integer, lose_count integer, win_amount bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_win_count  integer := 0;
  v_lose_count integer := 0;
  v_win_amount bigint  := 0;
  r record;
  v_draw_num text;
  v_hit integer;
  v_pay integer;
begin
  for r in
    select pl.id, pl.num, pl.amount, p.draw_date
    from public.purchase_lines pl
    join public.purchases p on p.id = pl.purchase_id
    where p.user_id = auth.uid() and pl.status = 'pending'
  loop
    select d.num into v_draw_num from public.draws d where d.draw_date = r.draw_date;
    if v_draw_num is null then
      continue;
    end if;
    v_hit := public.check_number(r.num, v_draw_num);
    if v_hit is not null then
      v_pay := public.payout_for(v_hit, r.amount);
      update public.purchase_lines set status = 'win', hit = v_hit, pay = v_pay where id = r.id;
      v_win_count := v_win_count + 1;
      v_win_amount := v_win_amount + coalesce(v_pay, 0);
    else
      update public.purchase_lines set status = 'lose', hit = null, pay = 0 where id = r.id;
      v_lose_count := v_lose_count + 1;
    end if;
  end loop;
  return query select v_win_count, v_lose_count, v_win_amount;
end;
$$;

-- Admin-only: evaluate every user's pending lines at once (e.g. to
-- run right after a draw closes, from the dashboard or a cron job).
create or replace function public.evaluate_all_purchases()
returns table (win_count integer, lose_count integer, win_amount bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_win_count  integer := 0;
  v_lose_count integer := 0;
  v_win_amount bigint  := 0;
  r record;
  v_draw_num text;
  v_hit integer;
  v_pay integer;
begin
  -- Allow a dashboard admin, or the fetch-draws Edge Function calling
  -- with the service role key (which has no auth.uid() of its own).
  if not (public.is_admin() or auth.role() = 'service_role') then
    raise exception 'not authorized';
  end if;

  for r in
    select pl.id, pl.num, pl.amount, p.draw_date
    from public.purchase_lines pl
    join public.purchases p on p.id = pl.purchase_id
    where pl.status = 'pending'
  loop
    select d.num into v_draw_num from public.draws d where d.draw_date = r.draw_date;
    if v_draw_num is null then
      continue;
    end if;
    v_hit := public.check_number(r.num, v_draw_num);
    if v_hit is not null then
      v_pay := public.payout_for(v_hit, r.amount);
      update public.purchase_lines set status = 'win', hit = v_hit, pay = v_pay where id = r.id;
      v_win_count := v_win_count + 1;
      v_win_amount := v_win_amount + coalesce(v_pay, 0);
    else
      update public.purchase_lines set status = 'lose', hit = null, pay = 0 where id = r.id;
      v_lose_count := v_lose_count + 1;
    end if;
  end loop;
  return query select v_win_count, v_lose_count, v_win_amount;
end;
$$;

-- To make yourself an admin after signing up in the app, run:
--   update public.profiles set is_admin = true where id =
--     (select id from auth.users where email = 'you@example.com');
