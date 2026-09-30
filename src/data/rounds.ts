import { supabase } from '../lib/supabase';

export interface Round {
  drawDate: string;   // YYYY-MM-DD, the draw day
  closesAt: string;   // ISO timestamp, decided by the server
}

// Difference between the server's clock and this phone's, so a countdown
// never shows time left after the server has already stopped selling.
let clockOffsetMs = 0;

export function serverNow(): number {
  return Date.now() + clockOffsetMs;
}

// Loads the next draw days with their exact closing times. Throws if the
// server can't be reached — the buy screen must not guess a closing time.
export async function fetchRounds(): Promise<Round[]> {
  const { data, error } = await supabase.rpc('list_rounds');
  if (error) throw error;
  const rows = (data ?? []) as { draw_date: string; closes_at: string; server_now: string }[];
  if (rows[0]?.server_now) clockOffsetMs = new Date(rows[0].server_now).getTime() - Date.now();
  return rows.map(r => ({ drawDate: r.draw_date, closesAt: r.closes_at }));
}

export function isRoundOpen(r: Round): boolean {
  return new Date(r.closesAt).getTime() > serverNow();
}

export function msUntilClose(r: Round): number {
  return Math.max(0, new Date(r.closesAt).getTime() - serverNow());
}

export function fmtCountdown(ms: number): string {
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return d > 0 ? `${d}d ${p(h)}:${p(m)}:${p(s)}` : `${p(h)}:${p(m)}:${p(s)}`;
}

// Laos is UTC+7 with no daylight saving; show closing times in Laos time
// whatever the phone's timezone is, so everyone sees the same clock.
export function fmtCloseTime(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 7 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}
