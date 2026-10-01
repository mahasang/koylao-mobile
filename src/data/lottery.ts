import AsyncStorage from '@react-native-async-storage/async-storage';
import rawDraws from './draws.json';
import { ANIMALS, ANIMAL_MAP, ANIMAL_EMOJI } from './animals';
import { supabase } from '../lib/supabase';

// status/source/updatedAt/confirmedAt are only known for results that came
// from the server; the bundled seed list has none of them. Only 'confirmed'
// results have paid out any bets.
export type Draw = {
  date: string; num: string;
  status?: 'pending' | 'confirmed';
  source?: string;
  updatedAt?: string;
  confirmedAt?: string | null;
};
export type Lang = 'lo' | 'th' | 'en';

const SEED: Draw[] = (rawDraws as Draw[]).sort((a, b) => b.date.localeCompare(a.date));
let _draws: Draw[] = SEED;

export function getDraws(): Draw[] {
  return _draws;
}

export const DRAWS: Draw[] = SEED;

const CACHE_KEY = 'koylao.draws.v1';

// Overlays server results on the bundled seed, newest first.
function mergeOverSeed(server: Draw[]): Draw[] {
  const byDate: Record<string, Draw> = {};
  SEED.forEach(d => { byDate[d.date] = d; });
  server.forEach(d => { byDate[d.date] = d; });
  return Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));
}

// Restores the results fetched on a previous run, so the first screen shows
// the latest draw instead of the (older) bundled seed while the network
// request is still in flight. Call once at startup, before rendering.
export async function loadCachedDraws(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const cached = JSON.parse(raw) as Draw[];
    if (Array.isArray(cached)) _draws = mergeOverSeed(cached);
  } catch {}
}

// Pulls the canonical results from Supabase's public.draws table (kept
// current server-side by the fetch-draws Edge Function) and merges them
// over the bundled seed, so the app always shows the same results to
// every user regardless of when it was last built. The server rows are
// also cached on the device for the next launch.
export async function fetchLatestDraws(): Promise<number> {
  const { data, error } = await supabase
    .from('draws')
    .select('draw_date, num, status, source, updated_at, confirmed_at')
    .order('draw_date', { ascending: false })
    .limit(400);
  if (error) throw error;

  const server: Draw[] = (data ?? []).map(row => ({
    date: row.draw_date, num: row.num, status: row.status, source: row.source,
    updatedAt: row.updated_at, confirmedAt: row.confirmed_at,
  }));

  const before = _draws.length;
  _draws = mergeOverSeed(server);
  AsyncStorage.setItem(CACHE_KEY, JSON.stringify(server)).catch(() => {});
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
