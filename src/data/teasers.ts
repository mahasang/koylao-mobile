import { ANIMAL_MAP, ANIMAL_EMOJI } from './animals';
import { animalName } from './lottery';
import type { Draw } from './lottery';
import type { Lang } from './i18n';
import { last2Stats } from '../utils/lottery';

export interface Teaser { date: string; title: string; body: string; screen: 'Lucky'; }

// Small deterministic hash so the same date always produces the same teaser
// (rescheduling never changes what a customer was going to see).
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const two = (n: number) => String(n).padStart(2, '0');
export const localDateStr = (d: Date) => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;

const emojiOf = (nn: string) => (ANIMAL_MAP[nn] ? ANIMAL_EMOJI[ANIMAL_MAP[nn]] : '🐾');
const label = (nn: string, lang: Lang) => `${emojiOf(nn)} ${animalName(nn, lang) ?? ''}`.trim();

// A daily "number of the day" for each of the next draw days, rotating between
// three kinds. Every one is entertainment — hot numbers are history, not a prediction.
export function buildTeasers(
  draws: Draw[], t: (k: string) => string | string[], lang: Lang, days = 7, now = new Date(),
): Teaser[] {
  const { stat } = last2Stats(draws);
  const hot = Object.keys(stat).sort((a, b) => stat[b].count - stat[a].count || a.localeCompare(b)).slice(0, 10);
  const note = t('teaserNote') as string;
  const out: Teaser[] = [];

  for (let i = 0; i < 14 && out.length < days; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;   // draws run Monday–Friday
    const date = localDateStr(d);
    const seed = hash(date);
    const kind = Math.floor(d.getTime() / 86400000) % 3;

    if (kind === 0 && hot.length > 0) {
      const nn = hot[seed % hot.length];
      out.push({ date, screen: 'Lucky', title: t('teaserTitleHot') as string,
        body: `${(t('teaserHot') as string).replace('{num}', nn).replace('{animal}', label(nn, lang)).replace('{n}', String(draws.length))} · ${note}` });
    } else if (kind === 1) {
      const nn = two(seed % 100);
      out.push({ date, screen: 'Lucky', title: t('teaserTitleRandom') as string,
        body: `${(t('teaserRandom') as string).replace('{num}', nn).replace('{animal}', label(nn, lang))} · ${note}` });
    } else {
      const nn = two(seed % 100);
      out.push({ date, screen: 'Lucky', title: t('teaserTitleRiddle') as string,
        body: `${(t('teaserRiddle') as string).replace('{emoji}', emojiOf(nn))} · ${note}` });
    }
  }
  return out;
}
