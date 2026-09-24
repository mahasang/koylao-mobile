import rawDraws from './draws.json';
import { ANIMALS, ANIMAL_MAP, ANIMAL_EMOJI } from './animals';
import { supabase } from '../lib/supabase';

export type Draw = { date: string; num: string };
export type Lang = 'lo' | 'th' | 'en';

const SEED: Draw[] = (rawDraws as Draw[]).sort((a, b) => b.date.localeCompare(a.date));
let _draws: Draw[] = SEED;

export function getDraws(): Draw[] {
  return _draws;
}

export const DRAWS: Draw[] = SEED;

// Pulls the canonical results from Supabase's public.draws table (kept
// current server-side by the fetch-draws Edge Function) and merges them
// over the bundled seed, so the app always shows the same results to
// every user regardless of when it was last built.
export async function fetchLatestDraws(): Promise<number> {
  const { data, error } = await supabase
    .from('draws')
    .select('draw_date, num')
    .order('draw_date', { ascending: false })
    .limit(400);
  if (error) throw error;

  const byDate: Record<string, Draw> = {};
  SEED.forEach(d => { byDate[d.date] = d; });
  (data ?? []).forEach(row => { byDate[row.draw_date] = { date: row.draw_date, num: row.num }; });

  const before = _draws.length;
  _draws = Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));
  return Math.max(0, _draws.length - before);
}

export function animalName(last2: string, lang: Lang = 'lo'): string | null {
  const key = ANIMAL_MAP[last2];
  if (!key) return null;
  const a = ANIMALS[key as keyof typeof ANIMALS];
  return a ? (a[lang as keyof typeof a] ?? a.th) : null;
}

export function animalEmoji(last2: string): string {
  const key = ANIMAL_MAP[last2];
  return key ? ANIMAL_EMOJI[key] : '🐾';
}

export { ANIMALS, ANIMAL_MAP };
