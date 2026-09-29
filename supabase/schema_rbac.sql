-- KoyLao roles, audit log, and feature flags — run this in the SQL
-- Editor AFTER schema.sql, schema_admin.sql, schema_admin_users.sql
-- and schema_wallet.sql.
--
-- Adds three things that are much cheaper to bolt on now than to
-- retrofit once there's real data and real money:
--   1. A `role` column so staff permissions aren't just one boolean —
--      a finance admin can adjust balances but NOT touch lottery
--      results, and a draws admin is the reverse.
--   2. An append-only audit_log that every sensitive admin action
--      writes to, so "who changed this and when" always has an answer.
--   3. A feature_flags table the app (and dashboard) can check to
--      flip things on/off without a redeploy.

-- ============================================================
-- Roles. `is_admin` (boolean) stays as the coarse "has dashboard
-- access at all" gate used by every existing RLS policy — role adds
-- finer permissions on top without touching those policies.
-- admin_set_role() is the only way to change it, and keeps both
-- columns in sync.
-- ============================================================
alter table public.profiles add column if not exists role text not null default 'user';

do $$ begin
  alter table public.profiles add constraint profiles_role_check
    check (role in ('user', 'super_admin', 'finance_admin', 'draws_admin', 'support_admin'));
exception when duplicate_object then null;
end $$;

-- Existing admins (from before roles existed) become super_admin.
update public.profiles set role = 'super_admin' where is_admin = true and role = 'user';

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((select role = 'super_admin' from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.can_edit_draws()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((select role in ('super_admin', 'draws_admin') from public.profiles where id = auth.uid()), false);
$$;

create or replace function public.can_edit_finance()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((select role in ('super_admin', 'finance_admin') from public.profiles where id = auth.uid()), false);
$$;

-- Tighten draws writes to draws-capable staff only — a finance or
-- support admin can no longer edit results even via direct table
-- access, not just through the dashboard's UI.
drop policy if exists "draws_write_admin" on public.draws;
create policy "draws_write_admin"
  on public.draws for all
  using (public.can_edit_draws())
  with check (public.can_edit_draws());

-- admin_list_users(): add role. Changing the return shape needs a
-- drop-then-create.
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
  role           text,
  created_at     timestamptz
)
language sql
security definer
set search_path = public
as $$
  select u.id, u.email, p.referral_code, p.credits, p.balance,
    (select count(*) from public.profiles r where r.referred_by = p.id) as referred_count,
    p.is_admin, p.role, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_admin()
  order by p.created_at desc;
$$;

-- ============================================================
-- Audit log. Append-only: no insert/update/delete policy for
-- clients at all — the only way a row gets written is log_audit(),
-- called from inside the other SECURITY DEFINER functions below, so
-- every sensitive action logs itself the same way no matter which
-- client called it.
-- ============================================================
create table if not exists public.audit_log (
  id           bigint generated always as identity primary key,
  actor_id     uuid references auth.users(id),
  action       text not null,
  target_table text,
  target_id    text,
  detail       jsonb,
  created_at   timestamptz not null default now()
);

alter table public.audit_log enable row level security;

drop policy if exists "audit_log_select_admin" on public.audit_log;
create policy "audit_log_select_admin"
  on public.audit_log for select
  using (public.is_admin());

create or replace function public.log_audit(p_action text, p_target_table text, p_target_id text, p_detail jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), p_action, p_target_table, p_target_id, p_detail);
$$;

-- Lets the dashboard show who did what without exposing auth.users
-- directly (the client can't join it itself).
create or replace function public.admin_list_audit_log(p_limit integer default 200)
returns table (
  id           bigint,
  actor_email  text,
  action       text,
  target_table text,
  target_id    text,
  detail       jsonb,
  created_at   timestamptz
)
language sql
security definer
set search_path = public
as $$
  select a.id, u.email, a.action, a.target_table, a.target_id, a.detail, a.created_at
  from public.audit_log a
  left join auth.users u on u.id = a.actor_id
  where public.is_admin()
  order by a.created_at desc
  limit p_limit;
$$;

-- admin_set_role(): the only way a role changes — super_admin only,
-- so a finance or draws admin can't grant themselves (or anyone else)
-- broader access.
create or replace function public.admin_set_role(target_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;
  if new_role not in ('user', 'super_admin', 'finance_admin', 'draws_admin', 'support_admin') then
    raise exception 'invalid role: %', new_role;
  end if;

  update public.profiles set role = new_role, is_admin = (new_role <> 'user')
  where id = target_id;
  if not found then
    raise exception 'user not found';
  end if;

  perform public.log_audit('set_role', 'profiles', target_id::text, jsonb_build_object('role', new_role));
end;
$$;

-- admin_adjust_balance(): now gated on can_edit_finance() instead of
-- the broader is_admin(), and logs every call.
create or replace function public.admin_adjust_balance(target_id uuid, delta bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_balance bigint;
begin
  if not public.can_edit_finance() then
    raise exception 'not authorized';
  end if;

  update public.profiles set balance = balance + delta
  where id = target_id
  returning balance into v_new_balance;

  if v_new_balance is null then
    raise exception 'user not found';
  end if;

  perform public.log_audit('adjust_balance', 'profiles', target_id::text,
    jsonb_build_object('delta', delta, 'new_balance', v_new_balance));

  return v_new_balance;
end;
$$;

-- admin_upsert_draw(): replaces the dashboard's old direct
-- `.from('draws').upsert()` call so a manual result edit is
-- gated on can_edit_draws() (not just RLS) and gets logged.
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

  insert into public.draws (draw_date, num, source, updated_at)
  values (p_draw_date, p_num, 'manual', now())
  on conflict (draw_date) do update set num = excluded.num, source = 'manual', updated_at = now();

  perform public.log_audit('upsert_draw', 'draws', p_draw_date::text, jsonb_build_object('num', p_num));
end;
$$;

-- evaluate_all_purchases(): unchanged logic, just logs a summary
-- entry whenever it actually paid something out (skips logging the
-- routine "nothing to settle yet" calls).
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

  if v_win_count > 0 or v_lose_count > 0 then
    perform public.log_audit('evaluate_all_purchases', 'purchase_lines', null,
      jsonb_build_object('win_count', v_win_count, 'lose_count', v_lose_count, 'win_amount', v_win_amount));
  end if;

  return query select v_win_count, v_lose_count, v_win_amount;
end;
$$;

-- ============================================================
-- Feature flags. Public read (the mobile app checks these even when
-- logged out), write restricted to super_admin only via
-- admin_set_flag() (logged, like everything else here).
-- ============================================================
create table if not exists public.feature_flags (
  key         text primary key,
  enabled     boolean not null default true,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);

alter table public.feature_flags enable row level security;

drop policy if exists "feature_flags_select_all" on public.feature_flags;
create policy "feature_flags_select_all"
  on public.feature_flags for select
  using (true);

insert into public.feature_flags (key, enabled, description) values
  ('buy_enabled', true, 'ເປີດ/ປິດການຊື້ຫວຍທັງລະບົບ'),
  ('random_generator_enabled', true, 'ເປີດ/ປິດຟີເຈີສຸ່ມເລກ'),
  ('maintenance_mode', false, 'ໂໝດປິດປັບປຸງລະບົບ (ບລັອກການຊື້ທັງໝົດ)')
on conflict (key) do nothing;

create or replace function public.admin_set_flag(p_key text, p_enabled boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'not authorized';
  end if;

  update public.feature_flags set enabled = p_enabled, updated_at = now(), updated_by = auth.uid()
  where key = p_key;
  if not found then
    raise exception 'unknown flag: %', p_key;
  end if;

  perform public.log_audit('set_feature_flag', 'feature_flags', p_key, jsonb_build_object('enabled', p_enabled));
end;
$$;

-- To make an existing user staff (or change their role) after this
-- migration, run this as a super_admin from the dashboard's Users
-- page, or directly via SQL once:
--   select public.admin_set_role(
--     (select id from auth.users where email = 'someone@example.com'),
--     'finance_admin'
--   );
