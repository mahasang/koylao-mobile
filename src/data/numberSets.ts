import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Draw } from './lottery';
import { last2Stats } from '../utils/lottery';
import type { CartItem } from './purchases';

const KEY = 'koylao_number_sets_v1';
const MAX_SAVED = 20;
const PRESET_SIZE = 10;

export interface SavedSet { id: string; name: string; items: CartItem[]; }
export interface PresetSet { id: 'hot2' | 'cold2' | 'doubles' | 'prev'; nums: string[]; }

// Ready-made sets built from the draw history on the phone. They only choose
// numbers — the stake is whatever the customer has typed.
export function buildPresets(draws: Draw[]): PresetSet[] {
  const { stat } = last2Stats(draws);
  const keys = Object.keys(stat);

  const hot = [...keys].sort((a, b) => stat[b].count - stat[a].count || a.localeCompare(b)).slice(0, PRESET_SIZE);
  // Longest absent first; a number that never appeared counts as absent the longest.
  const cold = [...keys]
    .sort((a, b) => (stat[b].lastIdx ?? Infinity) - (stat[a].lastIdx ?? Infinity) || a.localeCompare(b))
    .slice(0, PRESET_SIZE);
  const doubles = Array.from({ length: 10 }, (_, i) => `${i}${i}`);
  const latest = draws[0]?.num;
  const prev = latest ? [latest.slice(-2), latest.slice(-3)] : [];

  return [
    { id: 'hot2', nums: hot },
    { id: 'cold2', nums: cold },
    { id: 'doubles', nums: doubles },
    { id: 'prev', nums: prev },
  ].filter(p => p.nums.length > 0) as PresetSet[];
}

// Saved sets live on this phone only; storage failures just mean "no saved sets".
export async function loadSavedSets(): Promise<SavedSet[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function writeSets(sets: SavedSet[]): Promise<boolean> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(sets));
    return true;
  } catch {
    return false;
  }
}

export async function saveSet(name: string, items: CartItem[]): Promise<SavedSet[] | null> {
  const current = await loadSavedSets();
  const next = [{ id: `${Date.now()}`, name: name.trim(), items }, ...current].slice(0, MAX_SAVED);
  return (await writeSets(next)) ? next : null;
}

export async function deleteSet(id: string): Promise<SavedSet[]> {
  const next = (await loadSavedSets()).filter(s => s.id !== id);
  await writeSets(next);
  return next;
}
