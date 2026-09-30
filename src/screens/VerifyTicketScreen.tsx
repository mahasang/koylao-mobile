import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Keyboard } from 'react-native';
import { supabase } from '../lib/supabase';
import { fmtDateTime } from '../data/purchases';
import { fmtDate } from '../utils/lottery';
import { useI18n } from '../data/i18n';
import { C } from '../theme';

interface Verified {
  found: boolean; intact?: boolean; ticket_no?: string; draw_date?: string; created_at?: string;
  total?: number; lines?: { num: string; amount: number; status: string; pay: number | null }[];
}

// Anyone holding a ticket number + code can check the ticket against the
// server's records without signing in. The result shows nothing about the owner.
export default function VerifyTicketScreen() {
  const { t, lang } = useI18n();
  const [ticketNo, setTicketNo] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [result, setResult] = useState<Verified | null>(null);

  const verify = async () => {
    Keyboard.dismiss();
    if (!ticketNo.trim() || !code.trim()) return;
    setBusy(true); setFailed(false); setResult(null);
    const { data, error } = await supabase.rpc('verify_ticket', { p_ticket_no: ticketNo.trim(), p_code: code.trim() });
    if (error) setFailed(true); else setResult(data as Verified);
    setBusy(false);
  };

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <View style={s.card}>
        <Text style={s.label}>{t('verifyInputNo') as string}</Text>
        <TextInput style={s.input} value={ticketNo} onChangeText={setTicketNo} autoCapitalize="characters"
          autoCorrect={false} placeholder="KL260930-000001" placeholderTextColor={C.muted} />
        <Text style={s.label}>{t('verifyInputCode') as string}</Text>
        <TextInput style={s.input} value={code} onChangeText={setCode} autoCapitalize="characters"
          autoCorrect={false} placeholder="XXXX-XXXX-XXXX" placeholderTextColor={C.muted} />
        <TouchableOpacity style={[s.primaryBtn, busy && { opacity: 0.5 }]} onPress={verify} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnTxt}>🔍 {t('verifyBtn') as string}</Text>}
        </TouchableOpacity>
      </View>

      {failed && <Text style={s.bad}>⚠️ {t('verifyFail') as string}</Text>}

      {result && !result.found && <Text style={s.bad}>❌ {t('verifyNotFound') as string}</Text>}

      {result?.found && (
        <View style={[s.card, { borderWidth: 1, borderColor: result.intact ? '#2e9e4f' : '#e57373' }]}>
          <Text style={[s.verdict, { color: result.intact ? '#2e9e4f' : '#c0392b' }]}>
            {result.intact ? '✅ ' : '⚠️ '}{(result.intact ? t('verifyOk') : t('verifyTampered')) as string}
          </Text>
          <Text style={s.meta}>{t('ticketNo') as string}: {result.ticket_no}</Text>
          {result.draw_date && <Text style={s.meta}>{t('drawRoundLabel') as string}: {fmtDate(result.draw_date, lang)}</Text>}
          {result.created_at && <Text style={s.meta}>{fmtDateTime(result.created_at, lang)}</Text>}
          <Text style={s.meta}>{t('totalAmountLabel') as string}: {Number(result.total ?? 0).toLocaleString()} ₭</Text>
          <View style={s.divider} />
          {(result.lines ?? []).slice(0, 100).map(l => (
            <View key={l.num} style={s.lineRow}>
              <Text style={s.num}>{l.status === 'win' ? '✅' : l.status === 'lose' ? '❌' : '⏳'} {l.num}</Text>
              <Text style={s.meta}>{Number(l.amount).toLocaleString()} ₭{l.status === 'win' ? ` → +${Number(l.pay ?? 0).toLocaleString()}` : ''}</Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 14 },
  label: { color: C.muted, fontSize: 13, marginBottom: 6 },
  input: { backgroundColor: C.input, borderRadius: 10, padding: 12, color: C.text,
    fontFamily: 'Courier New', fontSize: 16, letterSpacing: 1, marginBottom: 12 },
  primaryBtn: { backgroundColor: C.accent, borderRadius: 10, padding: 14, alignItems: 'center' },
  primaryBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  bad: { color: '#c0392b', fontSize: 14, textAlign: 'center', fontWeight: 'bold', marginVertical: 8 },
  verdict: { fontSize: 15, fontWeight: 'bold', marginBottom: 8 },
  meta: { color: C.muted, fontSize: 12, marginBottom: 2 },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 8 },
  lineRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  num: { color: C.text, fontFamily: 'Courier New', fontSize: 14, fontWeight: 'bold' },
});
