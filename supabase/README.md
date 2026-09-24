# Backend setup

Run once, in order, after creating the Supabase project:

1. **SQL Editor → New query** → paste and run `schema.sql` (auth profiles + referrals).
2. **SQL Editor → New query** → paste and run `schema_admin.sql` (draws, purchases, admin role).
3. Make yourself an admin (needed for the dashboard):
   ```sql
   update public.profiles set is_admin = true
   where id = (select id from auth.users where email = 'you@example.com');
   ```

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
