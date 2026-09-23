import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, Keyboard,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { getDraws } from '../data/lottery';
import { checkNumber, prizeId, payoutFor, maxStakeFor, fmtDate } from '../utils/lottery';
import { useI18n } from '../data/i18n';
import { C } from '../theme';

const BETS_KEY = 'koylao_bets_v1';

type BetStatus = 'pending' | 'win' | 'lose';
interface Bet {
  id: string; num: string; amount: number; date: string;
  status: BetStatus; hit?: number | null; pay?: number;
}

function localDateStr(d: Date) {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function nextWorkday(): Date {
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

function getWorkdays(count = 7): string[] {
  const result: string[] = [];
  const cursor = new Date(); cursor.setHours(0, 0, 0, 0);
  while (result.length < count) {
    const wd = cursor.getDay();
    if (wd !== 0 && wd !== 6) result.push(localDateStr(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

export default function RiskScreen() {
  const { t, lang } = useI18n();
  const [bets, setBets] = useState<Bet[]>([]);
  const [betNum, setBetNum] = useState('');
  const [betAmt, setBetAmt] = useState('');
  const [betDate, setBetDate] = useState(localDateStr(nextWorkday()));
  const workdays = getWorkdays(7);

  const loadBets = async () => {
    try {
      const v = await AsyncStorage.getItem(BETS_KEY);
      setBets(v ? JSON.parse(v) : []);
    } catch { setBets([]); }
  };

  const saveBets = async (next: Bet[]) => {
    setBets(next);
    await AsyncStorage.setItem(BETS_KEY, JSON.stringify(next));
  };

  useFocusEffect(useCallback(() => { loadBets(); }, []));

  const evalBets = async (current: Bet[]): Promise<Bet[]> => {
    const draws = getDraws();
    const next = current.map(b => {
      if (b.status !== 'pending') return b;
      const draw = draws.find(d => d.date === b.date);
      if (!draw) return b;
      const r = checkNumber(b.num, draw.num);
      const hit = r.hit;
      return { ...b, status: (hit ? 'win' : 'lose') as BetStatus, hit, pay: hit ? payoutFor(hit, b.amount) ?? 0 : 0 };
    });
    await saveBets(next);
    return next;
  };

  const addBet = async () => {
    Keyboard.dismiss();
    const num = betNum.trim();
    const amount = parseInt(betAmt.replace(/\D/g, ''), 10);
    if (!/^\d{1,6}$/.test(num) || !amount || !betDate) { Alert.alert('', t('betBad') as string); return; }
    const max = maxStakeFor(num.length);
    if (max && amount > max) {
      Alert.alert('', (t('betMaxExceeded') as string)
        .replace('{n}', String(num.length)).replace('{max}', max.toLocaleString()));
      return;
    }
    if (bets.some(b => b.status === 'pending' && b.num === num && b.date === betDate)) {
      Alert.alert('', t('betDup') as string); return;
    }
    const newBet: Bet = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      num, amount, date: betDate, status: 'pending',
    };
    const next = await evalBets([newBet, ...bets]);
    Alert.alert('', t('betAdded') as string);
    setBetNum(''); setBetAmt('');
  };

  const checkNow = async () => {
    const prev = [...bets];
    const next = await evalBets(prev);
    const settled = next.filter((b, i) => b.status !== 'pending' && prev[i]?.status === 'pending');
    if (settled.length === 0) { Alert.alert('', t('noResultYet') as string); return; }
    settled.forEach(b => {
      const msg = b.status === 'win'
        ? (t('evaluatedWin') as string).replace('{n}', b.num).replace('{p}', t('p_' + prizeId(b.hit ?? 0)) as string)
        : (t('evaluatedLose') as string).replace('{n}', b.num);
      Alert.alert('', msg);
    });
  };

  const removeBet = async (id: string) => saveBets(bets.filter(b => b.id !== id));

  const pend = bets.filter(b => b.status === 'pending');
  const done = bets.filter(b => b.status !== 'pending').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30);
  const total = pend.reduce((sum, b) => sum + b.amount, 0);

  return (
    <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      <View style={s.card}>
        <Text style={s.cardTitle}>⏰ {t('riskTitle')}</Text>
        <Text style={s.hint}>{t('riskHint') as string}</Text>

        {/* workday picker */}
        <Text style={s.label}>{t('betDraw')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          {workdays.map(d => (
            <TouchableOpacity key={d} style={[s.dateChip, betDate === d && s.dateChipOn]} onPress={() => setBetDate(d)}>
              <Text style={[s.dateChipTxt, betDate === d && s.dateChipOnTxt]}>
                {fmtDate(d, lang, { weekday: 'short', day: 'numeric', month: 'short' })}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={s.label}>{t('betNum')}</Text>
        <TextInput style={s.input} value={betNum}
          onChangeText={v => setBetNum(v.replace(/\D/g, '').slice(0, 6))}
          keyboardType="numeric" placeholder={t('inputPh') as string}
          placeholderTextColor={C.muted} maxLength={6} />

        <Text style={s.label}>{t('betAmount')}</Text>
        <TextInput style={s.input} value={betAmt}
          onChangeText={setBetAmt} keyboardType="numeric"
          placeholder="1,000" placeholderTextColor={C.muted} />
        {betNum.length > 0 && (
          <Text style={s.stakeHint}>
            {(t('maxStakeHint') as string)
              .replace('{max}', (maxStakeFor(betNum.length) ?? 0).toLocaleString())
              .replace('{n}', String(betNum.length))}
          </Text>
        )}

        <TouchableOpacity style={s.primaryBtn} onPress={addBet}>
          <Text style={s.primaryBtnTxt}>➕ {t('addBet')}</Text>
        </TouchableOpacity>
      </View>

      {/* pending */}
      <View style={s.card}>
        <View style={s.rowBetween}>
          <Text style={s.cardTitle}>📌 {t('pendingBets')} <Text style={{ color: C.accent }}>{pend.length}</Text></Text>
          {pend.length > 0 && (
            <TouchableOpacity onPress={checkNow}>
              <Text style={s.link}>{t('checkNow')}</Text>
            </TouchableOpacity>
          )}
        </View>
        {pend.length === 0
          ? <Text style={s.empty}>{t('emptyBets') as string}</Text>
          : pend.map(b => (
            <View key={b.id} style={s.betItem}>
              <View style={{ flex: 1 }}>
                <Text style={s.betNum}>{b.num}</Text>
                <Text style={s.muted}>{fmtDate(b.date, lang, { day: 'numeric', month: 'short' })} · {b.amount.toLocaleString()} ₭</Text>
              </View>
              <TouchableOpacity onPress={() => removeBet(b.id)}>
                <Text style={{ fontSize: 20 }}>🗑</Text>
              </TouchableOpacity>
            </View>
          ))}
        {pend.length > 0 && (
          <Text style={[s.muted, { textAlign: 'right', marginTop: 8 }]}>
            {(t('stakeTotal') as string).replace('{v}', total.toLocaleString())}
          </Text>
        )}
      </View>

      {/* settled */}
      {done.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>📜 {t('doneBets')}</Text>
          {done.map(b => {
            const win = b.status === 'win';
            return (
              <View key={b.id} style={s.betItem}>
                <View style={{ flex: 1 }}>
                  <Text style={s.betNum}>{b.num}</Text>
                  <Text style={[s.betResult, win ? s.winTxt : s.loseTxt]}>
                    {win
                      ? `✓ ${t('p_' + prizeId(b.hit ?? 0))} · ${(t('estPay') as string).replace('{v}', (b.pay ?? 0).toLocaleString())}`
                      : `✕ ${t('savedLose')}`}
                  </Text>
                  <Text style={s.muted}>{fmtDate(b.date, lang, { day: 'numeric', month: 'short' })}</Text>
                </View>
                <TouchableOpacity onPress={() => removeBet(b.id)}>
                  <Text style={{ fontSize: 20 }}>🗑</Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      )}

      <Text style={s.disc}>ℹ️ {t('autoNote') as string}</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 14 },
  cardTitle: { color: C.text, fontSize: 17, fontWeight: 'bold', marginBottom: 8 },
  hint: { color: C.muted, fontSize: 13, lineHeight: 18, marginBottom: 14 },
  label: { color: C.muted, fontSize: 13, marginBottom: 6 },
  muted: { color: C.muted, fontSize: 12 },
  input: { backgroundColor: C.input, borderRadius: 10, padding: 12, color: C.text,
    fontFamily: 'Courier New', fontSize: 18, letterSpacing: 2, marginBottom: 12 },
  stakeHint: { color: C.muted, fontSize: 11, marginTop: -8, marginBottom: 12 },
  primaryBtn: { backgroundColor: C.accent, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4 },
  primaryBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  dateChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    backgroundColor: C.input, marginRight: 8, borderWidth: 1, borderColor: C.border },
  dateChipOn: { backgroundColor: C.accent, borderColor: C.accent },
  dateChipTxt: { color: C.muted, fontSize: 13 },
  dateChipOnTxt: { color: '#fff', fontWeight: 'bold' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  link: { color: C.accent, fontWeight: 'bold', fontSize: 14 },
  empty: { color: C.muted, fontSize: 13, textAlign: 'center', paddingVertical: 8 },
  betItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: C.border },
  betNum: { color: C.text, fontFamily: 'Courier New', fontSize: 20, letterSpacing: 2, fontWeight: 'bold' },
  betResult: { fontSize: 13, fontWeight: 'bold', marginTop: 2 },
  winTxt: { color: '#4caf50' },
  loseTxt: { color: '#e57373' },
  disc: { color: C.muted, fontSize: 11, textAlign: 'center', lineHeight: 16 },
});
