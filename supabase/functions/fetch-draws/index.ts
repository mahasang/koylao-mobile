// Supabase Edge Function: pulls the latest Lao lottery results from
// laodl.com and hands them to ingest_draws() (public.draws table).
// Deploy with: supabase functions deploy fetch-draws
// Schedule it (see supabase/README.md) so results land automatically
// without any client having to fetch laodl.com itself.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LAODL_URL = 'https://laodl.com/api/website/laolot/WinPrizeHistory?type=1';

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let rows: any[];
  try {
    const res = await fetch(LAODL_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`laodl.com HTTP ${res.status}`);
    const json = await res.json();
    rows = json?.resultData ?? [];
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const incoming = rows
    .filter((r) => r.winNumber && r.roundDate)
    .map((r) => ({
      draw_date: String(r.roundDate).slice(0, 10),
      num: String(r.winNumber),
      source: 'laodl',
      source_url: LAODL_URL,
    }));

  if (incoming.length === 0) {
    return new Response(JSON.stringify({ upserted: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ingest_draws() stores new results as PENDING (unless the
  // auto_confirm_draws flag is on), never overwrites a confirmed result,
  // and settles bets only for confirmed draws.
  const { data, error } = await supabase.rpc('ingest_draws', { p_rows: incoming });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ upserted: (data?.inserted ?? 0) + (data?.updated ?? 0), ...data }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
