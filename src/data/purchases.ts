import { supabase } from '../lib/supabase';
import { fmtDate } from '../utils/lottery';
import type { Lang } from './lottery';

export type LineStatus = 'pending' | 'win' | 'lose';
// amount = what was really bought; requested = what the customer asked for, set only when a quota cut it short.
export interface PurchaseLine { num: string; amount: number; requested?: number | null; status: LineStatus; hit?: number | null; pay?: number; }
export interface FullLine { num: string; requested: number; }
export interface Purchase {
  id: string; billNo: string; refNo: string; channel: string;
  drawDate: string; createdAt: string; lines: PurchaseLine[];
  // Issued by the server when the ticket is saved; absent on tickets that
  // predate the ticket system (those still have billNo/refNo).
  ticketNo?: string | null; verifyCode?: string | null;
  // Numbers that were full (sold out for this draw) and so were not bought at all.
  fullLines?: FullLine[];
}
// What create_purchase() returns once the ticket is really saved.
export interface Ticket {
  id: string; ticketNo: string; verifyCode: string; drawDate: string;
  closesAt: string | null; createdAt: string; lineCount: number; total: number;
  balanceAfter: number | null; replayed: boolean;
}
export interface CartItem { num: string; amount: number; }

export function localDateStr(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function fmtDateTime(iso: string, lang: Lang): string {
  const d = new Date(iso);
  const datePart = fmtDate(localDateStr(d), lang);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${datePart} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Client-side idempotency key for one purchase attempt. Re-sending the same
// id after a dropped connection returns the ticket already saved instead of
// charging twice, so the caller keeps it until the attempt is resolved.
export function newPurchaseId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 6)}`;
}

export type PurchaseErrorCode =
  | 'not_signed_in' | 'insufficient_balance' | 'round_closed' | 'invalid_draw_date'
  | 'buying_disabled' | 'duplicate_number' | 'invalid_line' | 'empty_cart'
  | 'too_many_lines' | 'all_full' | 'unknown';

const KNOWN_ERRORS: PurchaseErrorCode[] = [
  'not_signed_in', 'insufficient_balance', 'round_closed', 'invalid_draw_date',
  'buying_disabled', 'duplicate_number', 'invalid_line', 'empty_cart', 'too_many_lines', 'all_full',
];

// 'unknown' means we can't tell whether the server saved the ticket (e.g.
// the connection dropped) — the caller must check before telling the user
// anything either way.
export function purchaseErrorCode(e: any): PurchaseErrorCode {
  const msg = String(e?.message ?? '');
  return KNOWN_ERRORS.find(c => msg.includes(c)) ?? 'unknown';
}

function toTicket(j: any): Ticket {
  return {
    id: j.id, ticketNo: j.ticket_no, verifyCode: j.verify_code, drawDate: j.draw_date,
    closesAt: j.closes_at ?? null, createdAt: j.created_at, lineCount: Number(j.line_count),
    total: Number(j.total), balanceAfter: j.balance_after == null ? null : Number(j.balance_after),
    replayed: !!j.replayed,
  };
}

// Buys the cart through create_purchase(): the server checks the round is
// still open, the stake limits and the balance, deducts the money, and
// issues the ticket — all in one transaction. Throws on any failure.
export async function createPurchase(id: string, drawDate: string, cart: CartItem[], channel: string): Promise<Ticket> {
  const { data, error } = await supabase.rpc('create_purchase', {
    p_id: id,
    p_draw_date: drawDate,
    p_lines: cart.map(l => ({ num: l.num, amount: l.amount })),
    p_channel: channel,
  });
  if (error) throw error;
  if (!data?.ticket_no || !data?.verify_code) throw new Error('ticket_missing');
  return toTicket(data);
}

function mapPurchase(p: any): Purchase {
  return {
    id: p.id,
    billNo: p.bill_no,
    refNo: p.ref_no,
    channel: p.channel,
    drawDate: p.draw_date,
    createdAt: p.created_at,
    ticketNo: p.ticket_no ?? null,
    verifyCode: p.verify_code ?? null,
    fullLines: Array.isArray(p.full_lines) ? p.full_lines.map((f: any) => ({ num: f.num, requested: Number(f.requested) })) : [],
    lines: (p.purchase_lines ?? []).map((l: any) => ({
      num: l.num, amount: l.amount, requested: l.requested_amount ?? null, status: l.status, hit: l.hit,
      pay: l.pay == null ? l.pay : Number(l.pay),
    })),
  };
}

const PURCHASE_COLS =
  'id, bill_no, ref_no, channel, draw_date, created_at, ticket_no, verify_code, full_lines, purchase_lines(num, amount, requested_amount, status, hit, pay)';

// Reads one purchase back from the database. Returns null only when the
// query succeeded and there is no such purchase; throws when it can't tell.
export async function fetchPurchase(id: string): Promise<Purchase | null> {
  const { data, error } = await supabase.from('purchases').select(PURCHASE_COLS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? mapPurchase(data) : null;
}

// How much of each number is still on sale in a draw. Only an estimate: another
// customer can take the rest before this one pays, and the bill shows what was
// really bought. Returns null if the server can't be asked.
export async function previewQuota(drawDate: string, nums: string[]): Promise<Record<string, number> | null> {
  const { data, error } = await supabase.rpc('get_quota_remaining', { p_draw_date: drawDate, p_nums: nums });
  if (error || !Array.isArray(data)) return null;
  return Object.fromEntries((data as { num: string; remaining: number }[]).map(r => [r.num, Number(r.remaining)]));
}

// Loads the signed-in user's purchases (with their lines) from Supabase.
// Returns an empty list when logged out — there's nothing of theirs to show.
export async function loadPurchases(): Promise<Purchase[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('purchases')
    .select(PURCHASE_COLS)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error || !data) return [];

  return data.map(mapPurchase);
}

export interface NewWin { num: string; amount: number; pay: number; hit: number; drawDate: string; billNo: string; }

// Asks the server to evaluate all of the signed-in user's pending lines
// against the canonical draws table (see evaluate_my_purchases() in
// supabase/schema_admin.sql), then reloads to report what's new.
export async function evalPurchases(previous: Purchase[]) {
  const before = new Map<string, LineStatus>();
  previous.forEach(p => p.lines.forEach(l => before.set(`${p.id}:${l.num}`, l.status)));

  const { data, error } = await supabase.rpc('evaluate_my_purchases');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;

  const next = await loadPurchases();
  const newWins: NewWin[] = [];
  next.forEach(p => p.lines.forEach(l => {
    if (l.status === 'win' && before.get(`${p.id}:${l.num}`) !== 'win') {
      newWins.push({ num: l.num, amount: l.amount, pay: l.pay ?? 0, hit: l.hit ?? 0, drawDate: p.drawDate, billNo: p.ticketNo ?? p.billNo });
    }
  }));

  return {
    next,
    winCount: row?.win_count ?? 0,
    loseCount: row?.lose_count ?? 0,
    winAmt: Number(row?.win_amount ?? 0),
    newWins,
  };
}

export function overallLineIcon(status: LineStatus) {
  return status === 'pending' ? '⏳' : status === 'win' ? '✅' : '❌';
}

export function purchaseTotal(p: Purchase): number {
  return p.lines.reduce((sum, l) => sum + l.amount, 0);
}

export type OverallState = 'pending' | 'win' | 'lose';

export function overallPurchaseState(p: Purchase): OverallState {
  if (p.lines.some(l => l.status === 'pending')) return 'pending';
  if (p.lines.some(l => l.status === 'win')) return 'win';
  return 'lose';
}

export function overallPurchaseStatus(p: Purchase, t: (k: string) => string | string[]): { icon: string; text: string; state: OverallState } {
  const winCount = p.lines.filter(l => l.status === 'win').length;
  const state = overallPurchaseState(p);
  if (state === 'pending') return { icon: '⏳', text: t('statusPending') as string, state };
  if (state === 'win') return { icon: '✅', text: (t('statusWinCount') as string).replace('{n}', String(winCount)), state };
  return { icon: '❌', text: t('statusAllLose') as string, state };
}
