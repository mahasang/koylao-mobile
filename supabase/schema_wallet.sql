-- KoyLao trial-money wallet — run this in the SQL Editor AFTER schema.sql,
-- schema_admin.sql and schema_admin_users.sql.
--
-- Adds a per-user "เงินทดลอง" balance, separate from the small referral
-- `credits` (20-50 points per referral). Every user starts with
-- 1,000,000 (existing users included — a constant DEFAULT added via
-- ALTER TABLE backfills old rows too, Postgres doesn't need to rewrite
-- the table for this). Buying a ticket now spends from this balance,
-- and a win pays back into it — both server-side, so the client never
-- touches the number directly.
alter table public.profiles add column if not exists balance bigint not null default 1000000;

-- ============================================================
-- get_my_referral_stats(): add balance to what a user can read about
-- themselves. Changing the return shape needs a drop-then-create.
-- ============================================================
drop function if exists public.get_my_referral_stats();
create function public.get_my_referral_stats()
returns table (credits integer, referral_code text, referred_count bigint, balance bigint)
language sql
security definer
set search_path = public
as $$
  select p.credits, p.referral_code,
    (select count(*) from public.profiles r where r.referred_by = p.id) as referred_count,
    p.balance
  from public.profiles p
  where p.id = auth.uid();
$$;

-- ============================================================
-- admin_list_users(): same idea, for the dashboard.
-- ============================================================
drop function if exists public.admin_list_users();
create function public.admin_list_users()
returns table (
  id             uuid,
  email          text,
  referral_code  text,
  credits        integer,
  balance        bigint,
  referred_count bigint,
  is_admin       boolean,
  created_at     timestamptz
)
language sql
security definer
set search_path = public
as $$
  select u.id, u.email, p.referral_code, p.credits, p.balance,
    (select count(*) from public.profiles r where r.referred_by = p.id) as referred_count,
    p.is_admin, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_admin()
  order by p.created_at desc;
$$;

-- ============================================================
-- create_purchase(): the ONLY way a purchase gets created. Checks and
-- deducts the caller's balance atomically (row-locked with `for
-- update`), then inserts the purchase + its lines. Client code builds
-- p_lines as a JSON array of {"num": "...", "amount": ...}.
-- ============================================================
create or replace function public.create_purchase(
  p_id        text,
  p_bill_no   text,
  p_ref_no    text,
  p_channel   text,
  p_draw_date date,
  p_lines     jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total   bigint;
  v_balance bigint;
begin
  select coalesce(sum((line->>'amount')::bigint), 0) into v_total
  from jsonb_array_elements(p_lines) as line;

  if v_total <= 0 then
    raise exception 'empty_cart';
  end if;

  select balance into v_balance from public.profiles where id = auth.uid() for update;
  if v_balance is null then
    raise exception 'not_signed_in';
  end if;
  if v_balance < v_total then
    raise exception 'insufficient_balance';
  end if;

  insert into public.purchases (id, user_id, bill_no, ref_no, channel, draw_date, created_at)
  values (p_id, auth.uid(), p_bill_no, p_ref_no, p_channel, p_draw_date, now());

  insert into public.purchase_lines (purchase_id, num, amount, status)
  select p_id, line->>'num', (line->>'amount')::integer, 'pending'
  from jsonb_array_elements(p_lines) as line;

  update public.profiles set balance = balance - v_total where id = auth.uid();
end;
$$;

-- Purchases (and their lines) can now ONLY be created through
-- create_purchase() above, which is the only place balance gets
-- checked and deducted. Drop the old direct-insert policies so a
-- client can't create a purchase for free by calling .insert()
-- straight against the table.
drop policy if exists "purchases_insert_own" on public.purchases;
drop policy if exists "purchase_lines_insert_own" on public.purchase_lines;

-- ============================================================
-- evaluate_my_purchases() / evaluate_all_purchases(): pay winnings
-- back into the winner's balance, same as they already write hit/pay
-- onto the line.
-- ============================================================
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
      update public.profiles set balance = balance + coalesce(v_pay, 0) where id = auth.uid();
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
  if not (public.is_admin() or auth.role() = 'service_role') then
    raise exception 'not authorized';
  end if;

  for r in
    select pl.id, pl.num, pl.amount, p.draw_date, p.user_id
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
      update public.profiles set balance = balance + coalesce(v_pay, 0) where id = r.user_id;
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

-- ============================================================
-- admin_adjust_balance(): lets an admin top up or correct a user's
-- trial-money balance from the dashboard.
-- ============================================================
create or replace function public.admin_adjust_balance(target_id uuid, delta bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_balance bigint;
begin
  if not public.is_admin() then
    raise exception 'not authorized';
  end if;

  update public.profiles set balance = balance + delta
  where id = target_id
  returning balance into v_new_balance;

  if v_new_balance is null then
    raise exception 'user not found';
  end if;

  return v_new_balance;
end;
$$;
