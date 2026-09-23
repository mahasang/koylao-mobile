import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, Keyboard, Modal, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { getDraws } from '../data/lottery';
import { checkNumber, payoutFor, maxStakeFor, fmtDate } from '../utils/lottery';
import { useI18n } from '../data/i18n';
import { C } from '../theme';

const PURCHASES_KEY = 'koylao_purchases_v1';

type LineStatus = 'pending' | 'win' | 'lose';
interface PurchaseLine { num: string; amount: number; status: LineStatus; hit?: number | null; pay?: number; }
interface Purchase {
  id: string; billNo: string; refNo: string; channel: string;
  drawDate: string; createdAt: string; lines: PurchaseLine[];
}
interface CartItem { num: string; amount: number; }

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

function genBillNo(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const datePart = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${datePart}-${rand}`;
}

function genRefNo(): string {
  return String(Date.now()) + String(Math.floor(Math.random() * 900) + 100);
}

function fmtDateTime(iso: string, lang: 'lo' | 'th' | 'en'): string {
  const d = new Date(iso);
  const datePart = fmtDate(localDateStr(d), lang);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${datePart} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export default function RiskScreen() {
  const { t, lang } = useI18n();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [betNum, setBetNum] = useState('');
  const [betAmt, setBetAmt] = useState('');
  const [betDate, setBetDate] = useState(localDateStr(nextWorkday()));
  const [viewing, setViewing] = useState<{ purchase: Purchase; justConfirmed: boolean } | null>(null);
  const workdays = getWorkdays(7);

  const [randomOpen, setRandomOpen] = useState(false);
  const [rDigits, setRDigitsState] = useState(6);
  const [rFixed, setRFixed] = useState<string[]>(Array(6).fill(''));
  const [rQty, setRQty] = useState('10');
  const [rAmt, setRAmt] = useState('1000');

  const setRDigits = (n: number) => {
    setRDigitsState(n);
    setRFixed(prev => Array.from({ length: n }, (_, i) => prev[i] ?? ''));
  };
  const setRFixedAt = (i: number, v: string) => {
    const digit = v.replace(/\D/g, '').slice(-1);
    setRFixed(prev => prev.map((p, idx) => (idx === i ? digit : p)));
  };

  const loadPurchases = async () => {
    try {
      const v = await AsyncStorage.getItem(PURCHASES_KEY);
      setPurchases(v ? JSON.parse(v) : []);
    } catch { setPurchases([]); }
  };

  const savePurchases = async (next: Purchase[]) => {
    setPurchases(next);
    await AsyncStorage.setItem(PURCHASES_KEY, JSON.stringify(next));
  };

  useFocusEffect(useCallback(() => { loadPurchases(); }, []));

  const evalPurchases = async (current: Purchase[]) => {
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
  };

  const changeBetDate = (d: string) => {
    if (d === betDate) return;
    if (cart.length > 0) {
      Alert.alert('', t('dateChangeClears') as string, [
        { text: t('cancelBtn') as string, style: 'cancel' },
        { text: t('confirmBtn') as string, onPress: () => { setCart([]); setBetDate(d); } },
      ]);
      return;
    }
    setBetDate(d);
  };

  const addToCart = () => {
    Keyboard.dismiss();
    const num = betNum.trim();
    const amount = parseInt(betAmt.replace(/\D/g, ''), 10);
    if (!/^\d{1,6}$/.test(num) || !amount) { Alert.alert('', t('betBad') as string); return; }
    const max = maxStakeFor(num.length);
    if (max && amount > max) {
      Alert.alert('', (t('betMaxExceeded') as string)
        .replace('{n}', String(num.length)).replace('{max}', max.toLocaleString()));
      return;
    }
    const dup = cart.some(c => c.num === num) ||
      purchases.some(p => p.drawDate === betDate && p.lines.some(l => l.num === num));
    if (dup) { Alert.alert('', t('betDup') as string); return; }
    setCart(prev => [{ num, amount }, ...prev]);
    setBetNum(''); setBetAmt('');
  };

  const removeFromCart = (num: string) => setCart(prev => prev.filter(c => c.num !== num));

  const confirmRandom = () => {
    Keyboard.dismiss();
    const qty = Math.max(1, Math.min(1000, parseInt(rQty.replace(/\D/g, ''), 10) || 0));
    const amount = parseInt(rAmt.replace(/\D/g, ''), 10);
    if (!qty || !amount) { Alert.alert('', t('randomBad') as string); return; }
    const max = maxStakeFor(rDigits);
    if (max && amount > max) {
      Alert.alert('', (t('betMaxExceeded') as string)
        .replace('{n}', String(rDigits)).replace('{max}', max.toLocaleString()));
      return;
    }

    const wildcards = rFixed.filter(f => !f).length;
    const maxPossible = Math.pow(10, wildcards);
    const wanted = Math.min(qty, maxPossible);
    const existing = new Set([
      ...cart.map(c => c.num),
      ...purchases.filter(p => p.drawDate === betDate).flatMap(p => p.lines.map(l => l.num)),
    ]);
    const generated = new Set<string>();
    let attempts = 0;
    while (generated.size < wanted && attempts < wanted * 30 + 500) {
      const num = rFixed.map(f => f || String(Math.floor(Math.random() * 10))).join('');
      if (!existing.has(num) && !generated.has(num)) generated.add(num);
      attempts++;
    }

    if (generated.size === 0) { Alert.alert('', t('randomBad') as string); return; }

    setCart(prev => [...[...generated].map(num => ({ num, amount })), ...prev]);
    Alert.alert('', (t('randomAdded') as string).replace('{n}', String(generated.size)));
    setRandomOpen(false);
  };

  const confirmPurchase = async () => {
    if (cart.length === 0) { Alert.alert('', t('cartEmptyWarn') as string); return; }
    const now = new Date();
    const purchase: Purchase = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      billNo: genBillNo(now),
      refNo: genRefNo(),
      channel: t('demoChannel') as string,
      drawDate: betDate,
      createdAt: now.toISOString(),
      lines: cart.map(c => ({ ...c, status: 'pending' as LineStatus })),
    };
    const { next } = await evalPurchases([purchase, ...purchases]);
    setCart([]);
    const settled = next.find(p => p.id === purchase.id) ?? purchase;
    setViewing({ purchase: settled, justConfirmed: true });
  };

  const checkNow = async () => {
    const { winCount, loseCount, winAmt } = await evalPurchases(purchases);
    if (winCount + loseCount === 0) { Alert.alert('', t('noResultYet') as string); return; }
    Alert.alert('', (t('checkSummary') as string)
      .replace('{win}', String(winCount)).replace('{amt}', winAmt.toLocaleString()).replace('{lose}', String(loseCount)));
  };

  const removePurchase = async (id: string) => {
    Alert.alert('', t('confirmDeletePurchase') as string, [
      { text: t('cancelBtn') as string, style: 'cancel' },
      { text: t('confirmBtn') as string, style: 'destructive', onPress: () => savePurchases(purchases.filter(p => p.id !== id)) },
    ]);
  };

  const lineIcon = (status: LineStatus) => status === 'pending' ? '⏳' : status === 'win' ? '✅' : '❌';

  const overallStatus = (p: Purchase): { icon: string; text: string; color: string } => {
    const winCount = p.lines.filter(l => l.status === 'win').length;
    const pendingCount = p.lines.filter(l => l.status === 'pending').length;
    if (pendingCount > 0) return { icon: '⏳', text: t('statusPending') as string, color: C.muted };
    if (winCount > 0) return { icon: '✅', text: (t('statusWinCount') as string).replace('{n}', String(winCount)), color: '#2e9e4f' };
    return { icon: '❌', text: t('statusAllLose') as string, color: '#e57373' };
  };

  const cartTotal = cart.reduce((sum, c) => sum + c.amount, 0);
  const groupedDates = [...new Set(purchases.map(p => p.drawDate))].sort((a, b) => b.localeCompare(a));

  return (
    <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      <View style={s.card}>
        <Text style={s.cardTitle}>⏰ {t('riskTitle')}</Text>
        <Text style={s.hint}>{t('riskHint') as string}</Text>

        {/* workday picker */}
        <Text style={s.label}>{t('betDraw')}</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          {workdays.map(d => (
            <TouchableOpacity key={d} style={[s.dateChip, betDate === d && s.dateChipOn]} onPress={() => changeBetDate(d)}>
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

        <View style={s.btnRow}>
          <TouchableOpacity style={[s.primaryBtn, { flex: 1 }]} onPress={addToCart}>
            <Text style={s.primaryBtnTxt}>➕ {t('addBet')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.randomBtn} onPress={() => setRandomOpen(true)}>
            <Text style={s.randomBtnTxt}>🎲 {t('riskRandomBtn')}</Text>
          </TouchableOpacity>
        </View>

        {/* cart */}
        {cart.length > 0 && (
          <View style={s.cartBox}>
            <Text style={s.cartTitle}>🛒 {t('cartTitle')} <Text style={{ color: C.accent }}>{cart.length}</Text></Text>
            {cart.map(c => (
              <View key={c.num} style={s.cartRow}>
                <Text style={s.cartNum}>{c.num}</Text>
                <Text style={s.cartAmt}>{c.amount.toLocaleString()} ₭</Text>
                <TouchableOpacity onPress={() => removeFromCart(c.num)}>
                  <Text style={{ fontSize: 18 }}>🗑</Text>
                </TouchableOpacity>
              </View>
            ))}
            <Text style={[s.muted, { textAlign: 'right', marginVertical: 8 }]}>
              {(t('stakeTotal') as string).replace('{v}', cartTotal.toLocaleString())}
            </Text>
            <TouchableOpacity style={s.confirmPurchaseBtn} onPress={confirmPurchase}>
              <Text style={s.primaryBtnTxt}>✅ {t('confirmPurchaseBtn')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* random generator modal */}
      <Modal visible={randomOpen} animationType="slide" transparent onRequestClose={() => setRandomOpen(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>🎲 {t('riskRandomBtn')}</Text>

            <Text style={s.label}>{t('chooseDigits') as string}</Text>
            <View style={s.digitPickRow}>
              {[1, 2, 3, 4, 5, 6].map(n => (
                <TouchableOpacity key={n} style={[s.digitPickBtn, rDigits === n && s.digitPickBtnOn]}
                  onPress={() => setRDigits(n)}>
                  <Text style={[s.digitPickTxt, rDigits === n && s.digitPickTxtOn]}>{n}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>{t('fixDigitsLabel') as string}</Text>
            <View style={s.fixedRow}>
              {rFixed.map((v, i) => (
                <TextInput key={i} style={s.fixedBox} value={v}
                  onChangeText={val => setRFixedAt(i, val)}
                  keyboardType="numeric" maxLength={1} placeholder="?"
                  placeholderTextColor={C.muted} />
              ))}
            </View>

            <View style={s.rowGap}>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>{t('randomQtyLabel') as string}</Text>
                <TextInput style={s.input} value={rQty} onChangeText={setRQty}
                  keyboardType="numeric" placeholder="10" placeholderTextColor={C.muted} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.label}>{t('betAmount') as string}</Text>
                <TextInput style={s.input} value={rAmt} onChangeText={setRAmt}
                  keyboardType="numeric" placeholder="1,000" placeholderTextColor={C.muted} />
              </View>
            </View>
            <Text style={s.stakeHint}>
              {(t('maxStakeHint') as string)
                .replace('{max}', (maxStakeFor(rDigits) ?? 0).toLocaleString())
                .replace('{n}', String(rDigits))} · {t('randomQtyNote') as string}
            </Text>

            <View style={s.rowGap}>
              <TouchableOpacity style={[s.cancelBtn, { flex: 1 }]} onPress={() => setRandomOpen(false)}>
                <Text style={s.cancelBtnTxt}>{t('cancelBtn') as string}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.primaryBtn, { flex: 1 }]} onPress={confirmRandom}>
                <Text style={s.primaryBtnTxt}>{t('confirmBtn') as string}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* receipt / bill detail modal */}
      <Modal visible={!!viewing} animationType="fade" transparent onRequestClose={() => setViewing(null)}>
        <View style={s.modalOverlay}>
          <ScrollView style={s.receiptScroll} contentContainerStyle={{ paddingBottom: 24 }}>
            <View style={s.receiptCard}>
              <Text style={s.receiptCheck}>{viewing?.justConfirmed ? '✅' : '🧾'}</Text>
              <Text style={s.receiptTitle}>
                {viewing?.justConfirmed ? t('purchaseConfirmed') as string : t('billDetails') as string}
              </Text>
              {viewing && <Text style={s.receiptTime}>{fmtDateTime(viewing.purchase.createdAt, lang)}</Text>}
              <View style={s.receiptDivider} />
              {viewing && (
                <>
                  <View style={s.receiptRow}>
                    <Text style={s.receiptLabel}>{t('drawRoundLabel') as string}</Text>
                    <Text style={s.receiptValue}>{fmtDate(viewing.purchase.drawDate, lang)}</Text>
                  </View>
                  <View style={s.receiptTableHead}>
                    <Text style={[s.receiptTh, { flex: 1.6 }]}>{t('betNum') as string}</Text>
                    <Text style={s.receiptTh}>{t('betAmount') as string}</Text>
                  </View>
                  {viewing.purchase.lines.slice(0, 100).map(l => (
                    <View key={l.num} style={s.receiptTr}>
                      <Text style={[s.receiptTd, { flex: 1.6, fontFamily: 'Courier New' }]}>
                        {lineIcon(l.status)} {l.num}
                      </Text>
                      <Text style={[s.receiptTd,
                        l.status === 'win' && { color: '#2e9e4f', fontWeight: 'bold' },
                        l.status === 'lose' && { color: '#e57373' }]}>
                        {l.status === 'win' ? `+${(l.pay ?? 0).toLocaleString()}` : l.amount.toLocaleString()} ₭
                      </Text>
                    </View>
                  ))}
                  {viewing.purchase.lines.length > 100 && (
                    <Text style={[s.muted, { textAlign: 'center', marginTop: 6 }]}>
                      {(t('moreNumbers') as string).replace('{n}', String(viewing.purchase.lines.length - 100))}
                    </Text>
                  )}
                  <View style={s.receiptDivider} />
                  <View style={s.receiptRow}>
                    <Text style={s.receiptTotalLabel}>{t('totalCount') as string}</Text>
                    <Text style={s.receiptTotalValue}>{viewing.purchase.lines.length} {t('numbersUnit') as string}</Text>
                  </View>
                  <View style={s.receiptRow}>
                    <Text style={s.receiptTotalLabel}>{t('totalAmountLabel') as string}</Text>
                    <Text style={s.receiptTotalValue}>
                      {viewing.purchase.lines.reduce((sum, l) => sum + l.amount, 0).toLocaleString()} ₭
                    </Text>
                  </View>
                  <View style={s.receiptDivider} />
                  <Text style={s.receiptMeta}>{t('billNo') as string}: {viewing.purchase.billNo}</Text>
                  <Text style={s.receiptMeta}>{t('refNo') as string}: {viewing.purchase.refNo}</Text>
                  <Text style={s.receiptMeta}>{t('channel') as string}: {viewing.purchase.channel}</Text>
                </>
              )}
              <Text style={s.receiptDemo}>ℹ️ {t('demoNote') as string}</Text>
              <TouchableOpacity style={s.primaryBtn} onPress={() => setViewing(null)}>
                <Text style={s.primaryBtnTxt}>{t('close') as string}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* purchase history */}
      <View style={s.card}>
        <View style={s.rowBetween}>
          <Text style={s.cardTitle}>📜 {t('purchaseHistory') as string}</Text>
          {purchases.length > 0 && (
            <TouchableOpacity onPress={checkNow}>
              <Text style={s.link}>{t('checkNow')}</Text>
            </TouchableOpacity>
          )}
        </View>
        {purchases.length === 0
          ? <Text style={s.empty}>{t('emptyPurchases') as string}</Text>
          : groupedDates.map(date => (
            <View key={date} style={s.dateGroup}>
              <Text style={s.dateGroupTitle}>{t('drawRoundLabel') as string}: {fmtDate(date, lang)}</Text>
              {purchases
                .filter(p => p.drawDate === date)
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map(p => {
                  const totalAmt = p.lines.reduce((sum, l) => sum + l.amount, 0);
                  const st = overallStatus(p);
                  return (
                    <View key={p.id} style={s.purchaseRow}>
                      <Text style={s.purchaseRowIcon}>{st.icon}</Text>
                      <View style={{ flex: 1 }}>
                        <View style={s.rowBetween}>
                          <Text style={s.muted}>{fmtDateTime(p.createdAt, lang)}</Text>
                          <Text style={s.purchaseTotal}>{totalAmt.toLocaleString()} ₭</Text>
                        </View>
                        <Text style={s.purchaseSub}>{t('billNo') as string}: {p.billNo}</Text>
                        <Text style={s.purchaseSub}>{t('channel') as string}: {p.channel}</Text>
                        <View style={[s.rowBetween, { marginTop: 4, marginBottom: 0 }]}>
                          <Text style={[s.purchaseStatusTxt, { color: st.color }]}>
                            {st.text} · {p.lines.length} {t('numbersUnit') as string}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                            <TouchableOpacity onPress={() => setViewing({ purchase: p, justConfirmed: false })}>
                              <Text style={s.link}>{t('viewDetailsBtn') as string}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => removePurchase(p.id)}>
                              <Text style={{ fontSize: 16 }}>🗑</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    </View>
                  );
                })}
            </View>
          ))}
      </View>

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
  btnRow: { flexDirection: 'row', gap: 10 },
  randomBtn: { backgroundColor: C.violet + '22', borderWidth: 1, borderColor: C.violet,
    borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center',
    justifyContent: 'center', marginTop: 4 },
  randomBtnTxt: { color: C.violet, fontWeight: 'bold', fontSize: 15 },
  cartBox: { backgroundColor: C.input, borderRadius: 12, padding: 12, marginTop: 14 },
  cartTitle: { color: C.text, fontWeight: 'bold', fontSize: 14, marginBottom: 6 },
  cartRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: C.border, gap: 8 },
  cartNum: { flex: 1, color: C.text, fontFamily: 'Courier New', fontSize: 16, fontWeight: 'bold' },
  cartAmt: { color: C.muted, fontSize: 13 },
  confirmPurchaseBtn: { backgroundColor: '#2e9e4f', borderRadius: 10, padding: 14, alignItems: 'center' },
  modalOverlay: { flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  digitPickRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  digitPickBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center',
    backgroundColor: C.input, borderWidth: 1, borderColor: C.border },
  digitPickBtnOn: { backgroundColor: C.accent, borderColor: C.accent },
  digitPickTxt: { color: C.muted, fontWeight: 'bold', fontSize: 15 },
  digitPickTxtOn: { color: '#fff' },
  fixedRow: { flexDirection: 'row', gap: 8, marginBottom: 14, flexWrap: 'wrap' },
  fixedBox: { width: 44, height: 48, backgroundColor: C.input, borderRadius: 8,
    borderWidth: 1, borderColor: C.border, textAlign: 'center', color: C.text,
    fontFamily: 'Courier New', fontSize: 18 },
  rowGap: { flexDirection: 'row', gap: 10 },
  cancelBtn: { backgroundColor: C.input, borderRadius: 10, padding: 14,
    alignItems: 'center', marginTop: 4, borderWidth: 1, borderColor: C.border },
  cancelBtnTxt: { color: C.muted, fontWeight: 'bold', fontSize: 16 },
  dateChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20,
    backgroundColor: C.input, marginRight: 8, borderWidth: 1, borderColor: C.border },
  dateChipOn: { backgroundColor: C.accent, borderColor: C.accent },
  dateChipTxt: { color: C.muted, fontSize: 13 },
  dateChipOnTxt: { color: '#fff', fontWeight: 'bold' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  link: { color: C.accent, fontWeight: 'bold', fontSize: 14 },
  empty: { color: C.muted, fontSize: 13, textAlign: 'center', paddingVertical: 8 },
  dateGroup: { marginBottom: 10 },
  dateGroupTitle: { color: C.muted, fontSize: 12, fontWeight: 'bold', marginBottom: 6, textTransform: 'uppercase' },
  purchaseRow: { flexDirection: 'row', backgroundColor: C.input, borderRadius: 12,
    padding: 12, marginBottom: 10, gap: 10 },
  purchaseRowIcon: { fontSize: 20, marginTop: 2 },
  purchaseSub: { color: C.muted, fontSize: 11, marginBottom: 2 },
  purchaseStatusTxt: { fontSize: 12, fontWeight: 'bold' },
  purchaseTotal: { color: C.gold, fontWeight: 'bold', fontSize: 14 },
  disc: { color: C.muted, fontSize: 11, textAlign: 'center', lineHeight: 16 },
  receiptScroll: { maxHeight: '90%' },
  receiptCard: { backgroundColor: C.card, borderRadius: 20, padding: 24, margin: 16, alignItems: 'center' },
  receiptCheck: { fontSize: 46, marginBottom: 4 },
  receiptTitle: { color: C.text, fontSize: 18, fontWeight: 'bold' },
  receiptTime: { color: C.muted, fontSize: 12, marginTop: 4, marginBottom: 12 },
  receiptDivider: { height: 1, backgroundColor: C.border, width: '100%', marginVertical: 10 },
  receiptRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 4 },
  receiptLabel: { color: C.muted, fontSize: 13 },
  receiptValue: { color: C.text, fontSize: 13, fontWeight: 'bold' },
  receiptTableHead: { flexDirection: 'row', width: '100%', borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 6, marginBottom: 4 },
  receiptTh: { flex: 1, color: C.muted, fontSize: 12, fontWeight: 'bold' },
  receiptTr: { flexDirection: 'row', width: '100%', paddingVertical: 3 },
  receiptTd: { flex: 1, color: C.text, fontSize: 13 },
  receiptTotalLabel: { color: C.text, fontSize: 14, fontWeight: 'bold' },
  receiptTotalValue: { color: C.gold, fontSize: 14, fontWeight: 'bold' },
  receiptMeta: { color: C.muted, fontSize: 11, alignSelf: 'flex-start' },
  receiptDemo: { color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 14, marginBottom: 16, lineHeight: 16 },
});
