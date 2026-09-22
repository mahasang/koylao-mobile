-- KoyLao referral system schema.
-- Run this once in the Supabase project's SQL Editor (Project > SQL Editor > New query).

create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  referral_code text unique not null,
  referred_by   uuid references public.profiles(id),
  credits       integer not null default 0,
  created_at    timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Everyone can only read their own row. All writes happen server-side
-- (via the trigger below), so no insert/update/delete policy is granted.
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- Creates a profile (with a unique referral code) for every new auth user.
-- If the signup passed a referral code (in user_metadata.referred_by_code),
-- the new user gets a signup bonus and the referrer gets a commission —
-- both credited here, server-side, so the client can never fake it.
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

  if referrer_id is not null then
    update public.profiles set credits = credits + referrer_commission where id = referrer_id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Lets a logged-in user fetch their own code, balance, and how many
-- people they've referred, without exposing other users' rows.
create or replace function public.get_my_referral_stats()
returns table (credits integer, referral_code text, referred_count bigint)
language sql
security definer
set search_path = public
as $$
  select p.credits, p.referral_code,
    (select count(*) from public.profiles r where r.referred_by = p.id) as referred_count
  from public.profiles p
  where p.id = auth.uid();
$$;
