import { supabase } from '../lib/supabase';

export type LedgerKind =
  | 'opening_balance' | 'signup_bonus' | 'purchase' | 'win_payout'
  | 'deposit' | 'withdraw_hold' | 'withdraw_release' | 'admin_adjust';

export interface LedgerEntry {
  id: number; kind: LedgerKind; amount: number; balanceAfter: number;
  note: string | null; createdAt: string;
}

export type RequestKind = 'deposit' | 'withdraw';
export type RequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface WalletRequest {
  id: number; kind: RequestKind; amount: number; status: RequestStatus;
  note: string | null; decisionNote: string | null; createdAt: string; decidedAt: string | null;
}

// Every balance change is a ledger row written by the server; the app can
// only read them.
export async function loadLedger(limit = 100): Promise<LedgerEntry[]> {
  const { data, error } = await supabase
    .from('wallet_transactions')
    .select('id, kind, amount, balance_after, note, created_at')
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id, kind: r.kind, amount: Number(r.amount), balanceAfter: Number(r.balance_after),
    note: r.note, createdAt: r.created_at,
  }));
}

export async function loadRequests(limit = 30): Promise<WalletRequest[]> {
  const { data, error } = await supabase
    .from('wallet_requests')
    .select('id, kind, amount, status, note, decision_note, created_at, decided_at')
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id, kind: r.kind, amount: Number(r.amount), status: r.status, note: r.note,
    decisionNote: r.decision_note, createdAt: r.created_at, decidedAt: r.decided_at,
  }));
}

export async function requestWalletChange(kind: RequestKind, amount: number, note?: string): Promise<void> {
  const { error } = await supabase.rpc('request_wallet_change', {
    p_kind: kind, p_amount: amount, p_note: note?.trim() || null,
  });
  if (error) throw error;
}

export async function cancelWalletRequest(id: number): Promise<void> {
  const { error } = await supabase.rpc('cancel_wallet_request', { p_id: id });
  if (error) throw error;
}

export type WalletErrorCode = 'insufficient_balance' | 'invalid_amount' | 'too_many_pending' | 'request_not_pending' | 'unknown';

export function walletErrorCode(e: any): WalletErrorCode {
  const msg = String(e?.message ?? '');
  const codes: WalletErrorCode[] = ['insufficient_balance', 'invalid_amount', 'too_many_pending', 'request_not_pending'];
  return codes.find(c => msg.includes(c)) ?? 'unknown';
}
