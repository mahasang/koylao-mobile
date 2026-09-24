import AsyncStorage from '@react-native-async-storage/async-storage';
import rawDraws from './draws.json';
import { ANIMALS, ANIMAL_MAP, ANIMAL_EMOJI } from './animals';

export type Draw = { date: string; num: string };
export type Lang = 'lo' | 'th' | 'en';

const EXTRA_KEY = 'koylao_extra_draws_v1';
const SEED: Draw[] = (rawDraws as Draw[]).sort((a, b) => b.date.localeCompare(a.date));
let _extra: Draw[] = [];

export function getDraws(): Draw[] {
  const byDate: Record<string, Draw> = {};
  SEED.forEach(d => { byDate[d.date] = d; });
  _extra.forEach(d => { byDate[d.date] = d; });
  return Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));
}

// Loads whatever was fetched in a previous session, so the app doesn't
// fall back to the bundled seed data (which stops at build time) every
// time it's restarted, before the background fetch below has a chance to run.
export async function hydrateDraws(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(EXTRA_KEY);
    if (raw) _extra = JSON.parse(raw);
  } catch { /* keep whatever _extra already has */ }
}

async function saveExtra(all: Draw[]) {
  const seedDates = new Set(SEED.map(d => d.date));
  _extra = all.filter(d => !seedDates.has(d.date));
  try { await AsyncStorage.setItem(EXTRA_KEY, JSON.stringify(_extra)); } catch { /* non-fatal */ }
}

export async function resetExtra() {
  _extra = [];
  try { await AsyncStorage.removeItem(EXTRA_KEY); } catch { /* non-fatal */ }
}

export const DRAWS: Draw[] = SEED;

const UPDATE_API_URL = 'https://laodl.com/api/website/laolot/WinPrizeHistory?type=1';

// Fetches the latest draws from the official source and merges them into
// the shared in-memory store, so every screen using getDraws() sees them.
export async function fetchLatestDraws(): Promise<number> {
  const res = await fetch(UPDATE_API_URL, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  const rows: any[] = (j && j.resultData) || [];
  const current = getDraws();
  const byDate: Record<string, Draw> = {};
  current.forEach(d => { byDate[d.date] = d; });
  let added = 0;
  for (const r of rows) {
    if (!r.winNumber || !r.roundDate) continue;
    const date = r.roundDate.slice(0, 10);
    if (!byDate[date]) { byDate[date] = { date, num: String(r.winNumber) }; added++; }
    else if (byDate[date].num !== String(r.winNumber)) byDate[date].num = String(r.winNumber);
  }
  const next = Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));
  await saveExtra(next);
  return added;
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
