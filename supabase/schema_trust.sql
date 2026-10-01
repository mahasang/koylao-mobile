-- KoyLao "trust" layer — run this in the SQL Editor AFTER schema.sql,
-- schema_admin.sql, schema_admin_users.sql, schema_wallet.sql and
-- schema_rbac.sql. Safe to re-run.
--
-- What it fixes, in the order a customer would notice it:
--   1. Closing time is enforced by the SERVER clock (draw_rounds), not
--      by the phone. A purchase for a closed/past/weekend round is
--      rejected no matter which client sends it.
--   2. Every purchase gets a server-issued ticket number + verification
--      code, and create_purchase() is idempotent, so a retry after a
--      dropped connection can never double-charge or lose the ticket.
--   3. Draw results carry a status (pending/confirmed), a source and
--      timestamps. Money is only paid out for CONFIRMED results.
--   4. Balances change only through wallet_apply(), which writes an
--      append-only ledger row for every movement. A direct UPDATE of
--      profiles.balance (SQL editor, dashboard bug, anything) is refused.
--   5. Deposit / withdraw requests with admin approval, all on the ledger.
--   7. Per-number quotas ("เลขเต็ม"): each number can only be sold up to a
--      quota per draw across ALL customers; a bill records what was really
--      bought, what was asked for, and which numbers were full.
--   6. In-app notifications written by the server itself (ticket saved,
--      draw settled, result announced, deposit/withdraw decided, someone
--      used your referral code).

-- ============================================================
-- Shared helpers
-- ============================================================
create table if not exists public.app_secrets (
  key   text primary key,
  value text not null
);
alter table public.app_secrets enable row level security;  -- no policies: unreadable to clients

insert into public.app_secrets (key, value)
values ('ticket_salt', gen_random_uuid()::text || gen_random_uuid()::text)
on conflict (key) do nothing;

-- In-app notifications. Only the server writes them (from inside the
-- functions below), so a notification always reflects something that
-- really happened.
create table if not exists public.notifications (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  kind       text not null,
  data       jsonb not null default '{}'::jsonb,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications for select using (auth.uid() = user_id);

create or replace function public.notify(p_user uuid, p_kind text, p_data jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.notifications (user_id, kind, data) values (p_user, p_kind, coalesce(p_data, '{}'::jsonb));
$$;
revoke all on function public.notify(uuid, text, jsonb) from public, anon, authenticated;

create or replace function public.mark_notifications_read()
returns void
language sql
security definer
set search_path = public
as $$
  update public.notifications set read_at = now() where user_id = auth.uid() and read_at is null;
$$;
revoke all on function public.mark_notifications_read() from public, anon;
grant execute on function public.mark_notifications_read() to authenticated;

-- Mirrors MAX_STAKE in src/utils/lottery.ts: the most one bill can put on one number.
create or replace function public.max_stake_for(digits integer)
returns bigint
language sql
immutable
as $$
  select case digits
    when 6 then 25000 when 5 then 300000 when 4 then 2000000
    when 3 then 10000000 when 2 then 100000000 when 1 then 1000000000
    else 0
  end::bigint;
$$;

-- payout_for used to return integer: a 6-digit hit on a stake >= 6,000
-- pays > 2.1 billion and overflowed (the whole settlement then errored).
drop function if exists public.payout_for(integer, integer);
create function public.payout_for(hit integer, amount integer)
returns bigint
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
  end::bigint;
$$;

alter table public.purchase_lines alter column pay type bigint;

-- log_audit() was callable by any client through RPC, i.e. anyone could
-- forge audit rows. It is only ever called from other SECURITY DEFINER
-- functions (which run as the owner), so nobody else needs EXECUTE.
revoke all on function public.log_audit(text, text, text, jsonb) from public, anon, authenticated;

-- ============================================================
-- 1. Draw rounds: the server decides when a round closes.
--    Default close = 20:00 Laos time on the draw date (matches the
--    "ปิดรับเลข 20:00" the app has always shown). A draws admin can move
--    it for a single round with admin_set_round_close().
-- ============================================================
create table if not exists public.draw_rounds (
  draw_date  date primary key,
  closes_at  timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.draw_rounds enable row level security;

drop policy if exists "draw_rounds_select_all" on public.draw_rounds;
create policy "draw_rounds_select_all" on public.draw_rounds for select using (true);

create or replace function public.ensure_round(p_draw_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if extract(isodow from p_draw_date) not in (1, 2, 3, 4, 5) then
    raise exception 'invalid_draw_date';
  end if;
  insert into public.draw_rounds (draw_date, closes_at)
  values (p_draw_date, (p_draw_date + time '20:00') at time zone 'Asia/Vientiane')
  on conflict (draw_date) do nothing;
end;
$$;
revoke all on function public.ensure_round(date) from public, anon, authenticated;

-- What the buy screen shows: today's draw only (bets are same-day: you
-- cannot buy ahead for a later draw day), with its exact closing time, plus
-- the server's clock so the app can correct for a wrong phone clock.
-- On weekends there is no draw, so nothing is returned.
create or replace function public.list_rounds()
returns table (draw_date date, closes_at timestamptz, is_open boolean, server_now timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today date := (now() at time zone 'Asia/Vientiane')::date;
begin
  if extract(isodow from v_today) in (1, 2, 3, 4, 5) then
    perform public.ensure_round(v_today);
  end if;

  return query
    select r.draw_date, r.closes_at, r.closes_at > now(), now()
    from public.draw_rounds r
    where r.draw_date = v_today
    order by r.draw_date;
end;
$$;
grant execute on function public.list_rounds() to anon, authenticated;

create or replace function public.admin_set_round_close(p_draw_date date, p_closes_at timestamptz)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_edit_draws() then
    raise exception 'not authorized';
  end if;
  perform public.ensure_round(p_draw_date);
  update public.draw_rounds set closes_at = p_closes_at where draw_date = p_draw_date;
  perform public.log_audit('set_round_close', 'draw_rounds', p_draw_date::text,
    jsonb_build_object('closes_at', p_closes_at));
end;
$$;
revoke all on function public.admin_set_round_close(date, timestamptz) from public, anon;

-- ============================================================
-- 2. Draw results: status + source + timestamps.
-- ============================================================
alter table public.draws add column if not exists status       text not null default 'confirmed';
alter table public.draws add column if not exists confirmed_at timestamptz;
alter table public.draws add column if not exists confirmed_by uuid references auth.users(id);
alter table public.draws add column if not exists source_url   text;

do $$ begin
  alter table public.draws add constraint draws_status_check check (status in ('pending', 'confirmed'));
exception when duplicate_object then null;
end $$;

-- Results that existed before this migration were already being paid out.
update public.draws set confirmed_at = updated_at where status = 'confirmed' and confirmed_at is null;

insert into public.feature_flags (key, enabled, description) values
  ('auto_confirm_draws', false, 'ຢືນຢັນຜົນຫວຍອັດຕະໂນມັດເມື່ອດຶງຈາກເວັບ (ປິດ = ຕ້ອງໃຫ້ແອດມິນຢືນຢັນກ່ອນຈ່າຍເງິນ)')
on conflict (key) do nothing;

-- All writes to draws now go through the functions below (source data,
-- manual entry, confirmation) so each one is status-checked and logged.
drop policy if exists "draws_write_admin" on public.draws;

-- ============================================================
-- 3. Wallet ledger. Every balance change = one immutable row.
-- ============================================================
create table if not exists public.wallet_transactions (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in (
    'opening_balance', 'signup_bonus', 'purchase', 'win_payout',
    'deposit', 'withdraw_hold', 'withdraw_release', 'admin_adjust')),
  amount        bigint not null check (amount <> 0),
  balance_after bigint not null,
  ref_type      text,
  ref_id        text,
  note          text,
  actor_id      uuid,
  created_at    timestamptz not null default now()
);
create index if not exists wallet_transactions_user_idx on public.wallet_transactions (user_id, created_at desc);

alter table public.wallet_transactions enable row level security;

drop policy if exists "wallet_tx_select_own" on public.wallet_transactions;
create policy "wallet_tx_select_own" on public.wallet_transactions for select using (auth.uid() = user_id);

drop policy if exists "wallet_tx_select_admin" on public.wallet_transactions;
create policy "wallet_tx_select_admin" on public.wallet_transactions for select using (public.is_admin());

create or replace function public.wallet_tx_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'wallet_transactions is append-only';
end;
$$;

drop trigger if exists wallet_tx_no_update on public.wallet_transactions;
create trigger wallet_tx_no_update
  before update on public.wallet_transactions
  for each row execute function public.wallet_tx_immutable();

-- Refuse any change to profiles.balance that doesn't come from wallet_apply().
create or replace function public.profiles_balance_guard()
returns trigger
language plpgsql
as $$
begin
  if new.balance is distinct from old.balance
     and coalesce(current_setting('app.wallet_write', true), '') <> '1' then
    raise exception 'balance can only change through wallet_apply()';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_balance_guard on public.profiles;
create trigger profiles_balance_guard
  before update of balance on public.profiles
  for each row execute function public.profiles_balance_guard();

do $$ begin
  alter table public.profiles add constraint profiles_balance_nonneg check (balance >= 0) not valid;
exception when duplicate_object then null;
end $$;

-- The one and only door for money. Returns the ledger row id.
create or replace function public.wallet_apply(
  p_user     uuid,
  p_amount   bigint,
  p_kind     text,
  p_ref_type text,
  p_ref_id   text,
  p_note     text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
  v_tx_id   bigint;
begin
  if p_amount is null or p_amount = 0 then
    raise exception 'invalid_amount';
  end if;

  select balance into v_balance from public.profiles where id = p_user for update;
  if v_balance is null then
    raise exception 'user not found';
  end if;
  if v_balance + p_amount < 0 then
    raise exception 'insufficient_balance';
  end if;

  perform set_config('app.wallet_write', '1', true);
  update public.profiles set balance = balance + p_amount where id = p_user
  returning balance into v_balance;
  perform set_config('app.wallet_write', '', true);

  insert into public.wallet_transactions (user_id, kind, amount, balance_after, ref_type, ref_id, note, actor_id)
  values (p_user, p_kind, p_amount, v_balance, p_ref_type, p_ref_id, p_note, auth.uid())
  returning id into v_tx_id;

  return v_tx_id;
end;
$$;
revoke all on function public.wallet_apply(uuid, bigint, text, text, text, text) from public, anon, authenticated;

-- Existing balances become the ledger's opening entry, so
-- balance == sum(ledger) holds from day one.
insert into public.wallet_transactions (user_id, kind, amount, balance_after, note)
select p.id, 'opening_balance', p.balance, p.balance, 'Balance when the ledger was introduced'
from public.profiles p
where p.balance <> 0
  and not exists (select 1 from public.wallet_transactions w where w.user_id = p.id);

-- New users: the 1,000,000 trial money is now an explicit ledger entry
-- instead of a column default.
alter table public.profiles alter column balance set default 0;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_code     text;
  referrer_id  uuid;
  ref_input    text;
  signup_bonus constant integer := 20;
  referrer_commission constant integer := 50;
  trial_money  constant bigint := 1000000;
begin
  ref_input := upper(trim(new.raw_user_meta_data->>'referred_by_code'));

  loop
    new_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.profiles where referral_code = new_code);
  end loop;

  if ref_input is not null and ref_input <> '' then
    select id into referrer_id from public.profiles where referral_code = ref_input;
  end if;

  insert into public.profiles (id, referral_code, referred_by, credits)
  values (
    new.id,
    new_code,
    referrer_id,
    case when referrer_id is not null then signup_bonus else 0 end
  );

  perform public.wallet_apply(new.id, trial_money, 'signup_bonus', 'profiles', new.id::text, 'Trial money on signup');

  if referrer_id is not null then
    update public.profiles set credits = credits + referrer_commission where id = referrer_id;
    -- Tell the referrer someone used their code and what they earned (no details about the new user).
    perform public.notify(referrer_id, 'referral_joined', jsonb_build_object('credits', referrer_commission));
  end if;

  return new;
end;
$$;

-- Dashboard check: any user whose stored balance disagrees with their ledger.
create or replace function public.admin_wallet_reconcile()
returns table (user_id uuid, balance bigint, ledger_sum bigint)
language sql
security definer
set search_path = public
as $$
  select p.id, p.balance, coalesce(sum(w.amount), 0)::bigint
  from public.profiles p
  left join public.wallet_transactions w on w.user_id = p.id
  where public.is_admin()
  group by p.id, p.balance
  having p.balance <> coalesce(sum(w.amount), 0);
$$;
revoke all on function public.admin_wallet_reconcile() from public, anon;

-- Manual balance changes now need a written reason and land on the ledger.
drop function if exists public.admin_adjust_balance(uuid, bigint);
create or replace function public.admin_adjust_balance(target_id uuid, delta bigint, reason text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tx_id bigint;
  v_balance bigint;
begin
  if not public.can_edit_finance() then
    raise exception 'not authorized';
  end if;
  if reason is null or length(trim(reason)) < 3 then
    raise exception 'reason_required';
  end if;
  if delta is null or delta = 0 then
    raise exception 'invalid_amount';
  end if;

  v_tx_id := public.wallet_apply(target_id, delta, 'admin_adjust', 'admin', auth.uid()::text, trim(reason));
  select balance_after into v_balance from public.wallet_transactions where id = v_tx_id;

  perform public.log_audit('adjust_balance', 'profiles', target_id::text,
    jsonb_build_object('delta', delta, 'new_balance', v_balance, 'reason', trim(reason), 'ledger_id', v_tx_id));

  return v_balance;
end;
$$;
revoke all on function public.admin_adjust_balance(uuid, bigint, text) from public, anon;

-- ============================================================
-- 4. Purchases: server-issued ticket, idempotent, atomic.
-- ============================================================
alter table public.purchases add column if not exists ticket_no    text;
alter table public.purchases add column if not exists verify_code  text;
alter table public.purchases add column if not exists lines_digest text;
create unique index if not exists purchases_ticket_no_key on public.purchases (ticket_no) where ticket_no is not null;

create sequence if not exists public.ticket_seq;

-- ---- Number quotas -------------------------------------------------
-- A number can only be sold up to a quota per draw, across all customers.
-- Defaults come from the number of digits; a single number in a single draw
-- can be overridden (admin_set_number_quota). Change a default with
-- admin_set_quota_default — re-running this file never overwrites a value an
-- admin chose; it only replaces the original placeholder figures.
create table if not exists public.number_quota_defaults (
  digits integer primary key check (digits between 1 and 6),
  quota  bigint not null check (quota > 0)
);
insert into public.number_quota_defaults (digits, quota) values
  (6, 25000), (5, 300000), (4, 2000000), (3, 10000000), (2, 100000000), (1, 1000000000)
on conflict (digits) do update set quota = excluded.quota
  -- only while it still holds the first placeholder figure for that digit count
  where public.number_quota_defaults.quota =
    (array[2000000000, 1000000000, 200000000, 50000000, 5000000, 100000])[public.number_quota_defaults.digits];

create table if not exists public.number_quota_overrides (
  draw_date date not null,
  num       text not null check (num ~ '^[0-9]{1,6}$'),
  quota     bigint not null check (quota >= 0),
  primary key (draw_date, num)
);

create table if not exists public.number_sales (
  draw_date date not null,
  num       text not null,
  sold      bigint not null default 0 check (sold >= 0),
  primary key (draw_date, num)
);

alter table public.number_quota_defaults enable row level security;
alter table public.number_quota_overrides enable row level security;
alter table public.number_sales enable row level security;

drop policy if exists "quota_defaults_select_admin" on public.number_quota_defaults;
create policy "quota_defaults_select_admin" on public.number_quota_defaults for select using (public.is_admin());
drop policy if exists "quota_overrides_select_admin" on public.number_quota_overrides;
create policy "quota_overrides_select_admin" on public.number_quota_overrides for select using (public.is_admin());
drop policy if exists "number_sales_select_admin" on public.number_sales;
create policy "number_sales_select_admin" on public.number_sales for select using (public.is_admin());

alter table public.purchase_lines add column if not exists requested_amount integer;   -- only set when less was bought than asked for
alter table public.purchases add column if not exists full_lines jsonb not null default '[]'::jsonb;  -- [{num, requested}] numbers that were full

create or replace function public.quota_for(p_draw_date date, p_num text)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select quota from public.number_quota_overrides where draw_date = p_draw_date and num = p_num),
    (select quota from public.number_quota_defaults where digits = length(p_num)),
    0);
$$;
revoke all on function public.quota_for(date, text) from public, anon, authenticated;

-- What is still available for these numbers in this draw (an estimate: it can
-- change before the customer pays, the bill shows what was really bought).
create or replace function public.get_quota_remaining(p_draw_date date, p_nums text[])
returns table (num text, remaining bigint)
language sql
stable
security definer
set search_path = public
as $$
  select n, greatest(public.quota_for(p_draw_date, n) - coalesce(s.sold, 0), 0)::bigint
  from unnest(p_nums[1:1000]) as n
  left join public.number_sales s on s.draw_date = p_draw_date and s.num = n
  where n ~ '^[0-9]{1,6}$';
$$;
grant execute on function public.get_quota_remaining(date, text[]) to anon, authenticated;

create or replace function public.admin_set_quota_default(p_digits integer, p_quota bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_edit_draws() then raise exception 'not authorized'; end if;
  if p_digits not between 1 and 6 or p_quota is null or p_quota <= 0 then raise exception 'invalid_amount'; end if;
  insert into public.number_quota_defaults (digits, quota) values (p_digits, p_quota)
  on conflict (digits) do update set quota = excluded.quota;
  perform public.log_audit('set_quota_default', 'number_quota_defaults', p_digits::text, jsonb_build_object('quota', p_quota));
end;
$$;
revoke all on function public.admin_set_quota_default(integer, bigint) from public, anon;

create or replace function public.admin_set_number_quota(p_draw_date date, p_num text, p_quota bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_edit_draws() then raise exception 'not authorized'; end if;
  if p_num is null or p_num !~ '^[0-9]{1,6}$' or p_quota is null or p_quota < 0 then raise exception 'invalid_amount'; end if;
  insert into public.number_quota_overrides (draw_date, num, quota) values (p_draw_date, p_num, p_quota)
  on conflict (draw_date, num) do update set quota = excluded.quota;
  perform public.log_audit('set_number_quota', 'number_quota_overrides', p_draw_date::text || ':' || p_num, jsonb_build_object('quota', p_quota));
end;
$$;
revoke all on function public.admin_set_number_quota(date, text, bigint) from public, anon;

create or replace function public.lines_digest(p_purchase_id text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select encode(sha256(convert_to(
    coalesce(string_agg(num || ':' || amount::text, ',' order by num), ''), 'UTF8')), 'hex')
  from public.purchase_lines where purchase_id = p_purchase_id;
$$;
revoke all on function public.lines_digest(text) from public, anon, authenticated;

create or replace function public.ticket_code(p_ticket_no text, p_draw_date date, p_total bigint, p_created timestamptz, p_digest text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select upper(substr(encode(sha256(convert_to(
    (select value from public.app_secrets where key = 'ticket_salt')
    || '|' || p_ticket_no || '|' || p_draw_date::text || '|' || p_total::text
    || '|' || extract(epoch from p_created)::text || '|' || p_digest, 'UTF8')), 'hex'), 1, 12));
$$;
revoke all on function public.ticket_code(text, date, bigint, timestamptz, text) from public, anon, authenticated;

create or replace function public.purchase_json(p_id text, p_replayed boolean)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'ticket_no', p.ticket_no,
    'verify_code', p.verify_code,
    'draw_date', p.draw_date,
    'closes_at', r.closes_at,
    'created_at', p.created_at,
    'line_count', (select count(*) from public.purchase_lines where purchase_id = p.id),
    'total', (select coalesce(sum(amount), 0) from public.purchase_lines where purchase_id = p.id),
    'balance_after', (select balance_after from public.wallet_transactions
                      where ref_type = 'purchase' and ref_id = p.id and kind = 'purchase' limit 1),
    'replayed', p_replayed)
  from public.purchases p
  left join public.draw_rounds r on r.draw_date = p.draw_date
  where p.id = p_id;
$$;
revoke all on function public.purchase_json(text, boolean) from public, anon, authenticated;

drop function if exists public.create_purchase(text, text, text, text, date, jsonb);
create or replace function public.create_purchase(
  p_id        text,
  p_draw_date date,
  p_lines     jsonb,
  p_channel   text default 'app'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_today     date := (now() at time zone 'Asia/Vientiane')::date;
  v_closes_at timestamptz;
  v_total     bigint;
  v_count     integer;
  v_seq       bigint;
  v_ticket_no text;
  v_created   timestamptz := now();
  v_digest    text;
  v_tx_id     bigint;
  v_owner     uuid;
  r           record;
  v_sold      bigint;
  v_take      bigint;
  v_accepted  jsonb := '[]'::jsonb;
  v_full      jsonb := '[]'::jsonb;
  v_acc_count integer := 0;
begin
  if v_uid is null then
    raise exception 'not_signed_in';
  end if;
  if p_id is null or length(p_id) < 8 or length(p_id) > 80 then
    raise exception 'invalid_request';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'invalid_request';
  end if;

  -- Serialise this user's purchases, then a retry of the same id sees
  -- the first attempt's result instead of charging twice.
  perform 1 from public.profiles where id = v_uid for update;

  select user_id into v_owner from public.purchases where id = p_id;
  if found then
    if v_owner <> v_uid then
      raise exception 'invalid_request';
    end if;
    return public.purchase_json(p_id, true);
  end if;

  if exists (select 1 from public.feature_flags where key = 'maintenance_mode' and enabled)
     or exists (select 1 from public.feature_flags where key = 'buy_enabled' and not enabled) then
    raise exception 'buying_disabled';
  end if;

  -- Bets are same-day only: the round must be today's draw (a real draw day) and still open.
  if p_draw_date is null or p_draw_date <> v_today then
    raise exception 'invalid_draw_date';
  end if;
  perform public.ensure_round(p_draw_date);
  select closes_at into v_closes_at from public.draw_rounds where draw_date = p_draw_date;
  if v_created >= v_closes_at then
    raise exception 'round_closed';
  end if;

  -- Validate every line.
  select count(*), coalesce(sum(x.amount), 0) into v_count, v_total
  from jsonb_to_recordset(p_lines) as x(num text, amount bigint);

  if v_count = 0 then raise exception 'empty_cart'; end if;
  if v_count > 1000 then raise exception 'too_many_lines'; end if;

  if exists (
    select 1 from jsonb_to_recordset(p_lines) as x(num text, amount bigint)
    where x.num is null or x.num !~ '^[0-9]{1,6}$' or x.amount is null or x.amount <= 0
       or x.amount > public.max_stake_for(length(x.num))
  ) then
    raise exception 'invalid_line';
  end if;

  if (select count(distinct x.num) from jsonb_to_recordset(p_lines) as x(num text, amount bigint)) <> v_count
     or exists (
       select 1 from public.purchase_lines pl
       join public.purchases pu on pu.id = pl.purchase_id
       where pu.user_id = v_uid and pu.draw_date = p_draw_date
         and pl.num in (select x.num from jsonb_to_recordset(p_lines) as x(num text, amount bigint))
     ) then
    raise exception 'duplicate_number';
  end if;

  -- Quota: sell each number only up to what is left in this draw. Rows are
  -- locked in number order so two customers can never oversell a number (or
  -- deadlock). Numbers with nothing left are recorded as "full", not bought.
  v_total := 0;
  for r in
    select x.num, x.amount from jsonb_to_recordset(p_lines) as x(num text, amount bigint) order by x.num
  loop
    insert into public.number_sales (draw_date, num) values (p_draw_date, r.num) on conflict do nothing;
    select sold into v_sold from public.number_sales where draw_date = p_draw_date and num = r.num for update;
    v_take := least(r.amount, greatest(public.quota_for(p_draw_date, r.num) - v_sold, 0));
    if v_take <= 0 then
      v_full := v_full || jsonb_build_object('num', r.num, 'requested', r.amount);
    else
      update public.number_sales set sold = sold + v_take where draw_date = p_draw_date and num = r.num;
      v_accepted := v_accepted || jsonb_build_object('num', r.num, 'amount', v_take, 'requested', r.amount);
      v_total := v_total + v_take;
      v_acc_count := v_acc_count + 1;
    end if;
  end loop;

  if v_acc_count = 0 then
    raise exception 'all_full';
  end if;

  v_seq := nextval('public.ticket_seq');
  v_ticket_no := 'KL' || to_char(v_created at time zone 'Asia/Vientiane', 'YYMMDD') || '-' || lpad(v_seq::text, 6, '0');

  insert into public.purchases (id, user_id, bill_no, ref_no, channel, draw_date, created_at, ticket_no, full_lines)
  values (p_id, v_uid, v_ticket_no, 'pending', coalesce(nullif(trim(p_channel), ''), 'app'), p_draw_date, v_created, v_ticket_no, v_full);

  insert into public.purchase_lines (purchase_id, num, amount, requested_amount, status)
  select p_id, x.num, x.amount::integer, case when x.requested > x.amount then x.requested::integer end, 'pending'
  from jsonb_to_recordset(v_accepted) as x(num text, amount bigint, requested bigint);

  -- Raises insufficient_balance (rolling everything above back) if the wallet can't cover it.
  v_tx_id := public.wallet_apply(v_uid, -v_total, 'purchase', 'purchase', p_id, 'Bill ' || v_ticket_no);

  v_digest := public.lines_digest(p_id);
  update public.purchases
  set ref_no = 'W' || v_tx_id::text,
      lines_digest = v_digest,
      verify_code = public.ticket_code(v_ticket_no, p_draw_date, v_total, v_created, v_digest)
  where id = p_id;

  perform public.notify(v_uid, 'purchase_ok', jsonb_build_object(
    'ticket_no', v_ticket_no, 'draw_date', p_draw_date, 'total', v_total, 'line_count', v_acc_count,
    'full_count', jsonb_array_length(v_full)));

  return public.purchase_json(p_id, false);
end;
$$;
revoke all on function public.create_purchase(text, date, jsonb, text) from public, anon;
grant execute on function public.create_purchase(text, date, jsonb, text) to authenticated;

-- Anyone holding a ticket number + code can prove it exists and hasn't
-- been altered. Nothing about the owner is returned.
create or replace function public.verify_ticket(p_ticket_no text, p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.purchases%rowtype;
  v_total  bigint;
  v_digest text;
begin
  select * into p from public.purchases where ticket_no = upper(trim(p_ticket_no));
  if not found or p.verify_code is null
     or p.verify_code <> upper(replace(trim(coalesce(p_code, '')), '-', '')) then
    return jsonb_build_object('found', false);
  end if;

  v_digest := public.lines_digest(p.id);
  select coalesce(sum(amount), 0) into v_total from public.purchase_lines where purchase_id = p.id;

  return jsonb_build_object(
    'found', true,
    'intact', v_digest = p.lines_digest
              and public.ticket_code(p.ticket_no, p.draw_date, v_total, p.created_at, v_digest) = p.verify_code,
    'ticket_no', p.ticket_no,
    'draw_date', p.draw_date,
    'created_at', p.created_at,
    'total', v_total,
    'lines', (select coalesce(jsonb_agg(jsonb_build_object(
                'num', num, 'amount', amount, 'status', status, 'pay', pay) order by num), '[]'::jsonb)
              from public.purchase_lines where purchase_id = p.id));
end;
$$;
grant execute on function public.verify_ticket(text, text) to anon, authenticated;

-- ============================================================
-- 5. Settlement: only CONFIRMED results pay out; every payout is a
--    ledger row; a line can never be paid twice.
-- ============================================================
create or replace function public.settle_pending(p_user uuid)
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
  v_hit integer;
  v_pay bigint;
  v_purchases text[] := '{}';
begin
  for r in
    select pl.id, pl.num, pl.amount, p.id as purchase_id, p.user_id, p.ticket_no, d.num as draw_num
    from public.purchase_lines pl
    join public.purchases p on p.id = pl.purchase_id
    join public.draws d on d.draw_date = p.draw_date and d.status = 'confirmed'
    where pl.status = 'pending' and (p_user is null or p.user_id = p_user)
    for update of pl skip locked
  loop
    v_purchases := array_append(v_purchases, r.purchase_id);
    v_hit := public.check_number(r.num, r.draw_num);
    if v_hit is not null then
      v_pay := public.payout_for(v_hit, r.amount);
      update public.purchase_lines set status = 'win', hit = v_hit, pay = v_pay where id = r.id;
      perform public.wallet_apply(r.user_id, v_pay, 'win_payout', 'purchase_line', r.id::text,
        'Win ' || r.num || ' on bill ' || coalesce(r.ticket_no, '-'));
      v_win_count := v_win_count + 1;
      v_win_amount := v_win_amount + v_pay;
    else
      update public.purchase_lines set status = 'lose', hit = null, pay = 0 where id = r.id;
      v_lose_count := v_lose_count + 1;
    end if;
  end loop;

  insert into public.notifications (user_id, kind, data)
  select p.user_id, 'draw_result', jsonb_build_object(
    'ticket_no', p.ticket_no, 'draw_date', p.draw_date, 'line_count', count(*),
    'win_count', count(*) filter (where pl.status = 'win'),
    'pay', coalesce(sum(pl.pay) filter (where pl.status = 'win'), 0))
  from public.purchases p
  join public.purchase_lines pl on pl.purchase_id = p.id
  where p.id = any(v_purchases)
  group by p.id, p.user_id, p.ticket_no, p.draw_date;

  return query select v_win_count, v_lose_count, v_win_amount;
end;
$$;
revoke all on function public.settle_pending(uuid) from public, anon, authenticated;

create or replace function public.evaluate_my_purchases()
returns table (win_count integer, lose_count integer, win_amount bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not_signed_in';
  end if;
  return query select * from public.settle_pending(auth.uid());
end;
$$;

create or replace function public.evaluate_all_purchases()
returns table (win_count integer, lose_count integer, win_amount bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_wins integer; v_loses integer; v_amount bigint;
begin
  if not (public.is_admin() or auth.role() = 'service_role') then
    raise exception 'not authorized';
  end if;

  select s.win_count, s.lose_count, s.win_amount into v_wins, v_loses, v_amount
  from public.settle_pending(null) s;

  if v_wins > 0 or v_loses > 0 then
    perform public.log_audit('evaluate_all_purchases', 'purchase_lines', null,
      jsonb_build_object('win_count', v_wins, 'lose_count', v_loses, 'win_amount', v_amount));
  end if;

  return query select v_wins, v_loses, v_amount;
end;
$$;

-- ============================================================
-- 6. Draw result entry points (pending -> confirmed).
-- ============================================================
create or replace function public.confirm_draw_internal(p_draw_date date, p_actor uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_num text;
begin
  update public.draws
  set status = 'confirmed', confirmed_at = now(), confirmed_by = p_actor
  where draw_date = p_draw_date and status = 'pending'
  returning num into v_num;

  -- Announce the confirmed number to every member, once per draw.
  if v_num is not null then
    insert into public.notifications (user_id, kind, data)
    select id, 'draw_out', jsonb_build_object('draw_date', p_draw_date, 'num', v_num)
    from public.profiles;
  end if;
end;
$$;
revoke all on function public.confirm_draw_internal(date, uuid) from public, anon, authenticated;

-- Manual entry / correction. Lands as PENDING; a second explicit
-- admin_confirm_draw() is what releases payouts. A result that has
-- already settled bets can't be silently changed.
create or replace function public.admin_upsert_draw(p_draw_date date, p_num text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_edit_draws() then
    raise exception 'not authorized';
  end if;
  if p_num is null or p_num !~ '^[0-9]{6}$' then
    raise exception 'invalid_draw_number';
  end if;
  if exists (
    select 1 from public.draws d
    where d.draw_date = p_draw_date and d.status = 'confirmed'
      and exists (select 1 from public.purchases pu join public.purchase_lines pl on pl.purchase_id = pu.id
                  where pu.draw_date = p_draw_date and pl.status <> 'pending')
  ) then
    raise exception 'draw_already_settled';
  end if;

  insert into public.draws (draw_date, num, source, status, updated_at, confirmed_at, confirmed_by)
  values (p_draw_date, p_num, 'manual', 'pending', now(), null, null)
  on conflict (draw_date) do update
    set num = excluded.num, source = 'manual', status = 'pending',
        updated_at = now(), confirmed_at = null, confirmed_by = null;

  perform public.log_audit('upsert_draw', 'draws', p_draw_date::text, jsonb_build_object('num', p_num));
end;
$$;

create or replace function public.admin_confirm_draw(p_draw_date date)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_num text;
  v_wins integer; v_loses integer; v_amount bigint;
begin
  if not public.can_edit_draws() then
    raise exception 'not authorized';
  end if;

  select num into v_num from public.draws where draw_date = p_draw_date and status = 'pending';
  if not found then
    raise exception 'no_pending_draw';
  end if;

  perform public.confirm_draw_internal(p_draw_date, auth.uid());
  perform public.log_audit('confirm_draw', 'draws', p_draw_date::text, jsonb_build_object('num', v_num));

  select s.win_count, s.lose_count, s.win_amount into v_wins, v_loses, v_amount
  from public.settle_pending(null) s;
  if v_wins > 0 or v_loses > 0 then
    perform public.log_audit('settle_after_confirm', 'purchase_lines', p_draw_date::text,
      jsonb_build_object('win_count', v_wins, 'lose_count', v_loses, 'win_amount', v_amount));
  end if;

  return jsonb_build_object('win_count', v_wins, 'lose_count', v_loses, 'win_amount', v_amount);
end;
$$;
revoke all on function public.admin_upsert_draw(date, text) from public, anon;
revoke all on function public.admin_confirm_draw(date) from public, anon;

-- Called by the fetch-draws Edge Function (service role) with rows of
-- {draw_date, num, source, source_url}. New results arrive PENDING unless
-- the auto_confirm_draws flag is on. A confirmed result is never
-- overwritten by the feed: a mismatch is written to the audit log instead.
create or replace function public.ingest_draws(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auto     boolean := coalesce((select enabled from public.feature_flags where key = 'auto_confirm_draws'), false);
  v_inserted integer := 0;
  v_updated  integer := 0;
  v_conflicts integer := 0;
  v_wins integer := 0; v_loses integer := 0; v_amount bigint := 0;
  r record;
  cur public.draws%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'not authorized';
  end if;

  for r in select * from jsonb_to_recordset(p_rows) as x(draw_date date, num text, source text, source_url text)
  loop
    continue when r.draw_date is null or r.num is null or r.num !~ '^[0-9]{6}$';

    select * into cur from public.draws where draw_date = r.draw_date for update;
    if not found then
      insert into public.draws (draw_date, num, source, source_url, status, updated_at, confirmed_at)
      values (r.draw_date, r.num, coalesce(r.source, 'laodl'), r.source_url,
              case when v_auto then 'confirmed' else 'pending' end, now(),
              case when v_auto then now() end);
      v_inserted := v_inserted + 1;
    elsif cur.status = 'pending' then
      if cur.num <> r.num or cur.source_url is distinct from r.source_url then
        update public.draws
        set num = r.num, source = coalesce(r.source, source), source_url = r.source_url, updated_at = now()
        where draw_date = r.draw_date;
        v_updated := v_updated + 1;
      end if;
      if v_auto then
        perform public.confirm_draw_internal(r.draw_date, null);
      end if;
    elsif cur.num <> r.num then
      perform public.log_audit('draw_source_conflict', 'draws', r.draw_date::text,
        jsonb_build_object('confirmed_num', cur.num, 'feed_num', r.num, 'source', r.source));
      v_conflicts := v_conflicts + 1;
    end if;
  end loop;

  select s.win_count, s.lose_count, s.win_amount into v_wins, v_loses, v_amount
  from public.settle_pending(null) s;
  if v_wins > 0 or v_loses > 0 then
    perform public.log_audit('settle_after_ingest', 'purchase_lines', null,
      jsonb_build_object('win_count', v_wins, 'lose_count', v_loses, 'win_amount', v_amount));
  end if;

  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'conflicts', v_conflicts);
end;
$$;
revoke all on function public.ingest_draws(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_draws(jsonb) to service_role;

-- ============================================================
-- 7. Deposit / withdraw requests (admin-approved, on the ledger).
--    Withdrawals HOLD the money immediately (so it can't be spent
--    twice); rejecting or cancelling releases it.
-- ============================================================
create table if not exists public.wallet_requests (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('deposit', 'withdraw')),
  amount        bigint not null check (amount > 0),
  status        text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  note          text,
  decision_note text,
  decided_by    uuid,
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists wallet_requests_user_idx on public.wallet_requests (user_id, created_at desc);

alter table public.wallet_requests enable row level security;

drop policy if exists "wallet_requests_select_own" on public.wallet_requests;
create policy "wallet_requests_select_own" on public.wallet_requests for select using (auth.uid() = user_id);

drop policy if exists "wallet_requests_select_admin" on public.wallet_requests;
create policy "wallet_requests_select_admin" on public.wallet_requests for select using (public.is_admin());

create or replace function public.request_wallet_change(p_kind text, p_amount bigint, p_note text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id  bigint;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  if p_kind not in ('deposit', 'withdraw') then raise exception 'invalid_request'; end if;
  if p_amount is null or p_amount < 1000 or p_amount > 100000000 then raise exception 'invalid_amount'; end if;

  perform 1 from public.profiles where id = v_uid for update;

  if (select count(*) from public.wallet_requests where user_id = v_uid and status = 'pending') >= 5 then
    raise exception 'too_many_pending';
  end if;

  insert into public.wallet_requests (user_id, kind, amount, note)
  values (v_uid, p_kind, p_amount, nullif(trim(p_note), ''))
  returning id into v_id;

  if p_kind = 'withdraw' then
    perform public.wallet_apply(v_uid, -p_amount, 'withdraw_hold', 'wallet_request', v_id::text, 'Withdrawal request #' || v_id);
  end if;

  return v_id;
end;
$$;
revoke all on function public.request_wallet_change(text, bigint, text) from public, anon;
grant execute on function public.request_wallet_change(text, bigint, text) to authenticated;

create or replace function public.cancel_wallet_request(p_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  req public.wallet_requests%rowtype;
begin
  if v_uid is null then raise exception 'not_signed_in'; end if;
  perform 1 from public.profiles where id = v_uid for update;

  select * into req from public.wallet_requests where id = p_id and user_id = v_uid for update;
  if not found or req.status <> 'pending' then
    raise exception 'request_not_pending';
  end if;

  update public.wallet_requests set status = 'cancelled', decided_at = now() where id = p_id;
  if req.kind = 'withdraw' then
    perform public.wallet_apply(v_uid, req.amount, 'withdraw_release', 'wallet_request', p_id::text, 'Withdrawal #' || p_id || ' cancelled');
  end if;
end;
$$;
revoke all on function public.cancel_wallet_request(bigint) from public, anon;
grant execute on function public.cancel_wallet_request(bigint) to authenticated;

create or replace function public.admin_decide_request(p_id bigint, p_approve boolean, p_note text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req public.wallet_requests%rowtype;
begin
  if not public.can_edit_finance() then
    raise exception 'not authorized';
  end if;

  select * into req from public.wallet_requests where id = p_id for update;
  if not found or req.status <> 'pending' then
    raise exception 'request_not_pending';
  end if;
  if req.user_id = auth.uid() then
    raise exception 'cannot_decide_own_request';
  end if;

  update public.wallet_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      decision_note = nullif(trim(p_note), ''), decided_by = auth.uid(), decided_at = now()
  where id = p_id;

  if req.kind = 'deposit' and p_approve then
    perform public.wallet_apply(req.user_id, req.amount, 'deposit', 'wallet_request', p_id::text, 'Deposit request #' || p_id);
  elsif req.kind = 'withdraw' and not p_approve then
    perform public.wallet_apply(req.user_id, req.amount, 'withdraw_release', 'wallet_request', p_id::text, 'Withdrawal #' || p_id || ' rejected');
  end if;

  perform public.notify(req.user_id,
    case when not p_approve then 'request_rejected'
         when req.kind = 'deposit' then 'deposit_approved' else 'withdraw_approved' end,
    jsonb_build_object('request_id', p_id, 'kind', req.kind, 'amount', req.amount, 'note', nullif(trim(p_note), '')));

  perform public.log_audit('decide_wallet_request', 'wallet_requests', p_id::text,
    jsonb_build_object('kind', req.kind, 'amount', req.amount, 'approved', p_approve, 'note', p_note));
end;
$$;
revoke all on function public.admin_decide_request(bigint, boolean, text) from public, anon;
