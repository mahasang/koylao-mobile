import rawDraws from './draws.json';
import { ANIMALS, ANIMAL_MAP, ANIMAL_EMOJI } from './animals';

export type Draw = { date: string; num: string };
export type Lang = 'lo' | 'th' | 'en';

const SEED: Draw[] = (rawDraws as Draw[]).sort((a, b) => b.date.localeCompare(a.date));
let _extra: Draw[] = [];

export function getDraws(): Draw[] {
  const byDate: Record<string, Draw> = {};
  SEED.forEach(d => { byDate[d.date] = d; });
  _extra.forEach(d => { byDate[d.date] = d; });
  return Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));
}

export function saveExtra(all: Draw[]) {
  const seedDates = new Set(SEED.map(d => d.date));
  _extra = all.filter(d => !seedDates.has(d.date));
}

export function resetExtra() { _extra = []; }

export const DRAWS: Draw[] = SEED;

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
