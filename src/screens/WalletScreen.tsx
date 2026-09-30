import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, ActivityIndicator, Keyboard,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  loadLedger, loadRequests, requestWalletChange, cancelWalletRequest, walletErrorCode,
} from '../data/wallet';
import type { LedgerEntry, WalletRequest, RequestKind } from '../data/wallet';
import { fmtDateTime } from '../data/purchases';
import { useI18n } from '../data/i18n';
import { useAuth } from '../data/auth';
import AccountModal from '../components/AccountModal';
import { C } from '../theme';

const KIND_KEY: Record<string, string> = {
  opening_balance: 'kindOpening', signup_bonus: 'kindSignup', purchase: 'kindPurchase', win_payout: 'kindWin',
  deposit: 'kindDeposit', withdraw_hold: 'kindWithdrawHold', withdraw_release: 'kindWithdrawRelease',
  admin_adjust: 'kindAdjust',
};
const STATUS_KEY: Record<string, string> = {
  pending: 'reqPending', approved: 'reqApproved', rejected: 'reqRejected', cancelled: 'reqCancelled',
};

export default function WalletScreen() {
  const { t, lang } = useI18n();
  const { session, stats, refreshStats } = useAuth();
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [requests, setRequests] = useState<WalletRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [mode, setMode] = useState<RequestKind | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      const [l, r] = await Promise.all([loadLedger(), loadRequests(), refreshStats()]);
      setLedger(l);
      setRequests(r);
    } catch {
      setLoadFailed(true);
    }
    setLoading(false);
    // refreshStats is recreated every render; keying on the user id is what matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const submit = async () => {
    if (!mode) return;
    Keyboard.dismiss();
    const value = parseInt(amount.replace(/\D/g, ''), 10);
    if (!value || value < 1000 || value > 100000000) { Alert.alert('', t('walletBadAmount') as string); return; }
    setBusy(true);
    try {
      await requestWalletChange(mode, value, note);
      setMode(null); setAmount(''); setNote('');
      Alert.alert('', t('walletSent') as string);
      await load();
    } catch (e: any) {
      const code = walletErrorCode(e);
      Alert.alert('', code === 'insufficient_balance' ? t('insufficientBalance') as string
        : code === 'invalid_amount' ? t('walletBadAmount') as string
        : code === 'too_many_pending' ? t('walletTooMany') as string
        : t('walletFail') as string);
    }
    setBusy(false);
  };

  const cancel = async (id: number) => {
    try {
      await cancelWalletRequest(id);
      await load();
    } catch {
      Alert.alert('', t('walletFail') as string);
    }
  };

  if (!session) {
    return (
      <View style={s.center}>
        <Text style={s.muted}>{t('walletLoginNeeded') as string}</Text>
        <TouchableOpacity style={[s.primaryBtn, { marginTop: 12, paddingHorizontal: 28 }]} onPress={() => setAccountOpen(true)}>
          <Text style={s.primaryBtnTxt}>{t('loginBtn') as string}</Text>
        </TouchableOpacity>
        <AccountModal visible={accountOpen} onClose={() => setAccountOpen(false)} />
      </View>
    );
  }

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.balanceCard}>
        <Text style={s.balanceLabel}>{t('balanceLabel') as string}</Text>
        <Text style={s.balanceNum}>{(stats?.balance ?? 0).toLocaleString()} ₭</Text>
        <View style={s.btnRow}>
          <TouchableOpacity style={[s.actBtn, mode === 'deposit' && s.actBtnOn]} onPress={() => setMode(mode === 'deposit' ? null : 'deposit')}>
            <Text style={[s.actTxt, mode === 'deposit' && s.actTxtOn]}>⬇️ {t('walletDeposit') as string}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.actBtn, mode === 'withdraw' && s.actBtnOn]} onPress={() => setMode(mode === 'withdraw' ? null : 'withdraw')}>
            <Text style={[s.actTxt, mode === 'withdraw' && s.actTxtOn]}>⬆️ {t('walletWithdraw') as string}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {mode && (
        <View style={s.card}>
          <Text style={s.cardTitle}>{(mode === 'deposit' ? t('walletDeposit') : t('walletWithdraw')) as string}</Text>
          <Text style={s.label}>{t('walletAmount') as string}</Text>
          <TextInput style={s.input} value={amount} onChangeText={v => setAmount(v.replace(/\D/g, ''))}
            keyboardType="numeric" placeholder="100000" placeholderTextColor={C.muted} />
          <Text style={s.label}>{t('walletNoteOpt') as string}</Text>
          <TextInput style={[s.input, { fontFamily: undefined, letterSpacing: 0, fontSize: 14 }]} value={note}
            onChangeText={setNote} maxLength={200} placeholderTextColor={C.muted} />
          <TouchableOpacity style={[s.primaryBtn, busy && { opacity: 0.5 }]} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnTxt}>{t('walletSubmit') as string}</Text>}
          </TouchableOpacity>
        </View>
      )}

      <Text style={s.demo}>ℹ️ {t('walletDemoNote') as string}</Text>

      {loading && <ActivityIndicator color={C.accent} style={{ marginVertical: 12 }} />}
      {loadFailed && (
        <TouchableOpacity onPress={load}>
          <Text style={s.error}>⚠️ {t('walletLoadFail') as string} — {t('retryBtn') as string}</Text>
        </TouchableOpacity>
      )}

      {requests.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>📨 {t('walletRequests') as string}</Text>
          {requests.map(r => (
            <View key={r.id} style={s.reqRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.reqTitle}>
                  {(r.kind === 'deposit' ? '⬇️ ' : '⬆️ ')}{r.amount.toLocaleString()} ₭ · {t(STATUS_KEY[r.status]) as string}
                </Text>
                <Text style={s.muted}>#{r.id} · {fmtDateTime(r.createdAt, lang)}</Text>
                {r.decisionNote ? <Text style={s.muted}>💬 {r.decisionNote}</Text> : null}
              </View>
              {r.status === 'pending' && (
                <TouchableOpacity onPress={() => cancel(r.id)}>
                  <Text style={s.link}>{t('walletCancel') as string}</Text>
                </TouchableOpacity>
              )}
            </View>
          ))}
        </View>
      )}

      <View style={s.card}>
        <Text style={s.cardTitle}>📒 {t('walletLedger') as string}</Text>
        {ledger.length === 0 && !loading
          ? <Text style={s.muted}>{t('walletEmpty') as string}</Text>
          : ledger.map(e => (
            <View key={e.id} style={s.ledgerRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.ledgerKind}>{t(KIND_KEY[e.kind] ?? e.kind) as string}</Text>
                {e.note ? <Text style={s.muted} numberOfLines={1}>{e.note}</Text> : null}
                <Text style={s.muted}>{fmtDateTime(e.createdAt, lang)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.ledgerAmt, { color: e.amount > 0 ? '#2e9e4f' : '#e57373' }]}>
                  {e.amount > 0 ? '+' : ''}{e.amount.toLocaleString()}
                </Text>
                <Text style={s.muted}>{e.balanceAfter.toLocaleString()} ₭</Text>
              </View>
            </View>
          ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 14 },
  cardTitle: { color: C.text, fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  balanceCard: { backgroundColor: C.accent + '18', borderWidth: 1, borderColor: C.accent, borderRadius: 16,
    padding: 18, alignItems: 'center', marginBottom: 14 },
  balanceLabel: { color: C.muted, fontSize: 12 },
  balanceNum: { color: C.accent, fontSize: 30, fontWeight: 'bold', marginVertical: 6 },
  btnRow: { flexDirection: 'row', gap: 10, alignSelf: 'stretch', marginTop: 6 },
  actBtn: { flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.accent, borderRadius: 10, padding: 12, alignItems: 'center' },
  actBtnOn: { backgroundColor: C.accent },
  actTxt: { color: C.accent, fontWeight: 'bold', fontSize: 14 },
  actTxtOn: { color: '#fff' },
  label: { color: C.muted, fontSize: 13, marginBottom: 6 },
  input: { backgroundColor: C.input, borderRadius: 10, padding: 12, color: C.text,
    fontFamily: 'Courier New', fontSize: 18, letterSpacing: 2, marginBottom: 12 },
  primaryBtn: { backgroundColor: C.accent, borderRadius: 10, padding: 14, alignItems: 'center' },
  primaryBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  demo: { color: C.muted, fontSize: 11, lineHeight: 16, marginBottom: 14, textAlign: 'center' },
  muted: { color: C.muted, fontSize: 11, marginTop: 1 },
  error: { color: '#c0392b', fontSize: 13, textAlign: 'center', marginBottom: 12 },
  link: { color: C.accent, fontWeight: 'bold', fontSize: 12 },
  reqRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border, gap: 8 },
  reqTitle: { color: C.text, fontWeight: 'bold', fontSize: 14 },
  ledgerRow: { flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border, gap: 8 },
  ledgerKind: { color: C.text, fontWeight: 'bold', fontSize: 14 },
  ledgerAmt: { fontWeight: 'bold', fontSize: 15 },
});
