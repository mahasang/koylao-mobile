// Supabase Edge Function: pulls the latest Lao lottery results from
// laodl.com and upserts them into the canonical public.draws table.
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

  const upserts = rows
    .filter((r) => r.winNumber && r.roundDate)
    .map((r) => ({
      draw_date: String(r.roundDate).slice(0, 10),
      num: String(r.winNumber),
      source: 'laodl',
      updated_at: new Date().toISOString(),
    }));

  if (upserts.length === 0) {
    return new Response(JSON.stringify({ upserted: 0 }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { error } = await supabase.from('draws').upsert(upserts, { onConflict: 'draw_date' });
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Also settle any bets that were waiting on a result that just came in.
  await supabase.rpc('evaluate_all_purchases');

  return new Response(JSON.stringify({ upserted: upserts.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
