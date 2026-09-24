-- KoyLao admin dashboard support — run this in the SQL Editor AFTER
-- schema.sql and schema_admin.sql.
--
-- profiles has no email column (email lives in the protected auth.users
-- table), so the admin dashboard can't just select profiles directly and
-- show who's who. This SECURITY DEFINER function joins the two and
-- gates the result behind is_admin(), the same way get_my_referral_stats()
-- already gates a user's own stats — so the dashboard can call it with
-- just the anon key + a logged-in admin session, no service-role key
-- needed anywhere in the web app.
create or replace function public.admin_list_users()
returns table (
  id             uuid,
  email          text,
  referral_code  text,
  credits        integer,
  referred_count bigint,
  is_admin       boolean,
  created_at     timestamptz
)
language sql
security definer
set search_path = public
as $$
  select u.id, u.email, p.referral_code, p.credits,
    (select count(*) from public.profiles r where r.referred_by = p.id) as referred_count,
    p.is_admin, p.created_at
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_admin()
  order by p.created_at desc;
$$;
