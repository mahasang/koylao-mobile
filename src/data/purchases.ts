import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDraws } from './lottery';
import { checkNumber, payoutFor, fmtDate } from '../utils/lottery';
import type { Lang } from './lottery';

const PURCHASES_KEY = 'koylao_purchases_v1';

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

export async function loadPurchases(): Promise<Purchase[]> {
  try {
    const v = await AsyncStorage.getItem(PURCHASES_KEY);
    return v ? JSON.parse(v) : [];
  } catch { return []; }
}

export async function savePurchases(next: Purchase[]): Promise<void> {
  await AsyncStorage.setItem(PURCHASES_KEY, JSON.stringify(next));
}

export async function evalPurchases(current: Purchase[]) {
  const draws = getDraws();
  let winCount = 0, loseCount = 0, winAmt = 0;
  const next = current.map(p => {
    const draw = draws.find(d => d.date === p.drawDate);
    if (!draw) return p;
    const lines = p.lines.map(l => {
      if (l.status !== 'pending') return l;
      const r = checkNumber(l.num, draw.num);
      if (r.hit) {
        const pay = payoutFor(r.hit, l.amount) ?? 0;
        winCount++; winAmt += pay;
        return { ...l, status: 'win' as LineStatus, hit: r.hit, pay };
      }
      loseCount++;
      return { ...l, status: 'lose' as LineStatus, hit: null, pay: 0 };
    });
    return { ...p, lines };
  });
  await savePurchases(next);
  return { next, winCount, loseCount, winAmt };
}

export function overallLineIcon(status: LineStatus) {
  return status === 'pending' ? '⏳' : status === 'win' ? '✅' : '❌';
}
