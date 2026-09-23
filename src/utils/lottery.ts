import type { Draw, Lang } from '../data/lottery';

export type CheckResult = {
  hit: number | null;
  nearMiss: boolean;
};

export function checkNumber(userNum: string, drawNum: string): CheckResult {
  if (!/^\d{1,6}$/.test(userNum) || !drawNum) return { hit: null, nearMiss: false };
  let best: number | null = null;
  const maxN = Math.min(userNum.length, 6);
  for (let n = maxN; n >= 1; n--) {
    if (userNum.slice(-n) === drawNum.slice(-n)) { best = n; break; }
  }
  const nearMiss = best === null && userNum.length >= 2 && (
    (userNum.slice(-2)[0] === drawNum.slice(-2)[0]) !==
    (userNum.slice(-2)[1] === drawNum.slice(-2)[1])
  );
  return { hit: best, nearMiss };
}

export function prizeId(hit: number): string {
  return hit === 6 ? 'full6' : 'd' + hit;
}

export const PAY_MULT: Record<number, number> = {
  6: 400000000, 5: 40000000, 4: 5000000, 3: 500000, 2: 60000, 1: 5000,
};

export function payoutFor(hit: number | null, amount: number): number | null {
  if (!hit || !PAY_MULT[hit]) return null;
  return Math.round((amount / 1000) * PAY_MULT[hit]);
}

// Max stake allowed per digit-count: fewer digits = easier to win, so the
// ceiling is higher; a full 6-digit match pays a huge multiplier, so its
// stake is capped much lower to limit payout exposure.
export const MAX_STAKE: Record<number, number> = {
  6: 20000, 5: 1000000, 4: 10000000, 3: 20000000, 2: 50000000, 1: 100000000,
};

export function maxStakeFor(digitCount: number): number | null {
  return MAX_STAKE[digitCount] ?? null;
}

const LOCALE_MAP: Record<Lang, string> = { lo: 'lo-LA', th: 'th-TH', en: 'en-GB' };

export function fmtDate(
  dateStr: string,
  lang: Lang = 'lo',
  opts?: Intl.DateTimeFormatOptions,
): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T12:00:00');
  try {
    return new Intl.DateTimeFormat(LOCALE_MAP[lang], opts ?? { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  } catch { return dateStr; }
}

export type Stat = {
  count: number;
  lastIdx: number | null;
  lastDate: string | null;
};

export function last2Stats(draws: Draw[]): { stat: Record<string, Stat>; total: number } {
  const total = draws.length;
  const stat: Record<string, Stat> = {};
  for (let i = 0; i < 100; i++) {
    stat[String(i).padStart(2, '0')] = { count: 0, lastIdx: null, lastDate: null };
  }
  draws.forEach((d, i) => {
    const k = d.num.slice(-2);
    if (stat[k]) {
      stat[k].count++;
      if (stat[k].lastIdx === null) { stat[k].lastIdx = i; stat[k].lastDate = d.date; }
    }
  });
  return { stat, total };
}

export function nextDrawInfo() {
  const now = new Date();
  const target = new Date(now);
  target.setHours(20, 0, 0, 0);
  const wd = now.getDay();
  let add = 0;
  if (wd === 6) add = 2;
  else if (wd === 0) add = 1;
  else if (wd === 5 && now >= target) add = 3;
  else if (now >= target) add = 1;
  target.setDate(target.getDate() + add);
  const ms = target.getTime() - now.getTime();
  return {
    date: target,
    days: Math.floor(ms / 86400000),
    hours: Math.floor((ms % 86400000) / 3600000),
    minutes: Math.floor((ms % 3600000) / 60000),
    seconds: Math.floor((ms % 60000) / 1000),
  };
}
