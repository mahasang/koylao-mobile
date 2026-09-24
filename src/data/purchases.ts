import { supabase } from '../lib/supabase';
import { fmtDate } from '../utils/lottery';
import type { Lang } from './lottery';

export type LineStatus = 'pending' | 'win' | 'lose';
export interface PurchaseLine { num: string; amount: number; status: LineStatus; hit?: number | null; pay?: number; }
export interface Purchase {
  id: string; billNo: string; refNo: string; channel: string;
  drawDate: string; createdAt: string; lines: PurchaseLine[];
}
export interface CartItem { num: string; amount: number; }

export function localDateStr(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function nextWorkday(): Date {
  const now = new Date();
  const t = new Date(now); t.setHours(20, 0, 0, 0);
  const wd = now.getDay(); let add = 0;
  if (wd === 6) add = 2;
  else if (wd === 0) add = 1;
  else if (wd === 5 && now >= t) add = 3;
  else if (now >= t) add = 1;
  t.setDate(t.getDate() + add);
  return t;
}

export function getWorkdays(count = 7): string[] {
  const result: string[] = [];
  const cursor = new Date(); cursor.setHours(0, 0, 0, 0);
  while (result.length < count) {
    const wd = cursor.getDay();
    if (wd !== 0 && wd !== 6) result.push(localDateStr(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function genBillNo(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const datePart = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${datePart}-${rand}`;
}

function genRefNo(): string {
  return String(Date.now()) + String(Math.floor(Math.random() * 900) + 100);
}

export function fmtDateTime(iso: string, lang: Lang): string {
  const d = new Date(iso);
  const datePart = fmtDate(localDateStr(d), lang);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${datePart} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function buildPurchase(drawDate: string, cart: CartItem[], channel: string): Purchase {
  const now = new Date();
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    billNo: genBillNo(now),
    refNo: genRefNo(),
    channel,
    drawDate,
    createdAt: now.toISOString(),
    lines: cart.map(c => ({ ...c, status: 'pending' as LineStatus })),
  };
}

// Writes a freshly-built purchase (see buildPurchase) to Supabase.
// Requires a signed-in user — callers must check useAuth().session first.
export async function insertPurchase(p: Purchase): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not signed in');

  const { error: purchaseErr } = await supabase.from('purchases').insert({
    id: p.id, user_id: user.id, bill_no: p.billNo, ref_no: p.refNo,
    channel: p.channel, draw_date: p.drawDate, created_at: p.createdAt,
  });
  if (purchaseErr) throw purchaseErr;

  const lineRows = p.lines.map(l => ({ purchase_id: p.id, num: l.num, amount: l.amount, status: 'pending' }));
  const { error: linesErr } = await supabase.from('purchase_lines').insert(lineRows);
  if (linesErr) throw linesErr;
}

// Loads the signed-in user's purchases (with their lines) from Supabase.
// Returns an empty list when logged out — there's nothing of theirs to show.
export async function loadPurchases(): Promise<Purchase[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('purchases')
    .select('id, bill_no, ref_no, channel, draw_date, created_at, purchase_lines(num, amount, status, hit, pay)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error || !data) return [];

  return data.map((p: any) => ({
    id: p.id,
    billNo: p.bill_no,
    refNo: p.ref_no,
    channel: p.channel,
    drawDate: p.draw_date,
    createdAt: p.created_at,
    lines: (p.purchase_lines ?? []).map((l: any) => ({
      num: l.num, amount: l.amount, status: l.status, hit: l.hit, pay: l.pay,
    })),
  }));
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
      newWins.push({ num: l.num, amount: l.amount, pay: l.pay ?? 0, hit: l.hit ?? 0, drawDate: p.drawDate, billNo: p.billNo });
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
