# Backend setup

Run once, in order, after creating the Supabase project:

1. **SQL Editor → New query** → paste and run `schema.sql` (auth profiles + referrals).
2. **SQL Editor → New query** → paste and run `schema_admin.sql` (draws, purchases, admin role).
3. **SQL Editor → New query** → paste and run `schema_admin_users.sql` (lets the admin dashboard list users with their email).
4. **SQL Editor → New query** → paste and run `schema_wallet.sql` (trial-money balance: 1,000,000 for every user, spent on purchase, paid back on a win).
5. **SQL Editor → New query** → paste and run `schema_rbac.sql` (roles, audit log, feature flags — see below).
6. Make yourself an admin (needed for the dashboard):
   ```sql
   update public.profiles set is_admin = true
   where id = (select id from auth.users where email = 'you@example.com');
   ```
   `schema_rbac.sql` automatically promotes anyone with `is_admin = true` at the
   time it runs to `role = 'super_admin'`, so do this step *before* step 5 if
   you haven't made yourself admin yet — otherwise use `admin_set_role()`
   afterwards (see below).

## Roles, audit log, and feature flags

`schema_rbac.sql` adds finer-grained staff permissions on top of the single
`is_admin` boolean:

- **Roles**: `super_admin` (everything), `finance_admin` (can adjust user
  balances, cannot touch draws), `draws_admin` (can edit lottery results,
  cannot touch balances), `support_admin` (read-only). Change a user's role
  (super_admin only) via:
  ```sql
  select public.admin_set_role(
    (select id from auth.users where email = 'someone@example.com'),
    'finance_admin'  -- or 'draws_admin', 'support_admin', 'super_admin', 'user'
  );
  ```
  or from the dashboard's Users page.
- **Audit log**: every balance adjustment, manual draw edit, role change, and
  settlement run writes to `audit_log` — viewable on the dashboard's Audit
  Log page, or via `select * from public.admin_list_audit_log();`.
- **Feature flags**: `feature_flags` table, readable by anyone (including the
  mobile app), editable only by `super_admin` via `admin_set_flag('key',
  true/false)` or the dashboard's Feature Flags page. Seeded with
  `buy_enabled`, `random_generator_enabled`, and `maintenance_mode`.

## Deploy the fetch-draws Edge Function

Requires the [Supabase CLI](https://supabase.com/docs/guides/cli) logged in and linked to this project (`supabase login`, `supabase link --project-ref <ref>`), run from `koylao-mobile/`:

```bash
supabase functions deploy fetch-draws
```

Test it manually once:
```bash
supabase functions invoke fetch-draws
```
It should respond with `{"upserted": N}`.

## Schedule it (so results update automatically)

In the SQL Editor, enable the extensions once:
```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

Then schedule the function. Lao lottery results land ~20:25-20:30 Laos time (UTC+7) on weekdays, so this runs a few times around then to catch it, plus a daily catch-up. **Replace `<project-ref>` and `<anon-key>`** with your project's values (Project Settings → API):

```sql
select cron.schedule(
  'fetch-draws-evening',
  '35,40,50 13 * * 1-5', -- 20:35 / 20:40 / 20:50 Laos time = 13:35/13:40/13:50 UTC, Mon-Fri
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/fetch-draws',
    headers := jsonb_build_object('Authorization', 'Bearer <anon-key>')
  );
  $$
);
```

To remove or change the schedule later:
```sql
select cron.unschedule('fetch-draws-evening');
```

You can also trigger a fetch on demand from the admin dashboard's "Sync now" button, or by re-running `supabase functions invoke fetch-draws`.

## Admin dashboard

A separate Next.js app at `../koylao-admin` (sibling folder) gives admins a
web UI: an overview page, a users list, a purchases/bets list (with a
"ตรวจผลทั้งหมดตอนนี้" button that calls `evaluate_all_purchases`), and a draws
page (manual add/edit + a "ดึงผลล่าสุดตอนนี้" button that calls the
`fetch-draws` function directly). It uses the same Supabase URL/anon key as
the mobile app (see `koylao-admin/.env.local.example`) — no service-role key
needed, since access is gated by the `is_admin()` policies and the
`admin_list_users()` function above. Run it with `npm run dev` from
`koylao-admin/`.
