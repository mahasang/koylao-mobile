import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, Keyboard, Modal, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  loadPurchases, evalPurchases, buildPurchase, fmtDateTime, overallLineIcon,
  localDateStr, nextWorkday, getWorkdays,
} from '../data/purchases';
import type { Purchase, CartItem } from '../data/purchases';
import { maxStakeFor, fmtDate } from '../utils/lottery';
import { useI18n } from '../data/i18n';
import { C } from '../theme';

const AMOUNT_STEP = 1000;

function bumpAmount(value: string, delta: number, max: number | null): string {
  const cur = parseInt(value.replace(/\D/g, ''), 10) || 0;
  let next = cur + delta;
  if (next < 0) next = 0;
  if (max && next > max) next = max;
  return String(next);
}

export default function RiskBuyScreen() {
  const { t, lang } = useI18n();
  const nav = useNavigation<any>();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [betNum, setBetNum] = useState('');
  const [betAmt, setBetAmt] = useState('1000');
  const [betDate, setBetDate] = useState(localDateStr(nextWorkday()));
  const [receipt, setReceipt] = useState<Purchase | null>(null);
  const workdays = getWorkdays(7);

  const [randomOpen, setRandomOpen] = useState(false);
  const [rDigits, setRDigitsState] = useState(6);
  const [rFixed, setRFixed] = useState<string[]>(Array(6).fill(''));
  const [rQty, setRQty] = useState('10');
  const [rAmt, setRAmt] = useState('1000');

  React.useEffect(() => { loadPurchases().then(setPurchases); }, []);

  const setRDigits = (n: number) => {
    setRDigitsState(n);
    setRFixed(prev => Array.from({ length: n }, (_, i) => prev[i] ?? ''));
  };
  const setRFixedAt = (i: number, v: string) => {
    const digit = v.replace(/\D/g, '').slice(-1);
    setRFixed(prev => prev.map((p, idx) => (idx === i ? digit : p)));
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
    setBetNum('');
  };

  const removeFromCart = (num: string) => setCart(prev => prev.filter(c => c.num !== num));

  const bumpCartAmount = (num: string, delta: number) => {
    setCart(prev => prev.map(c => {
      if (c.num !== num) return c;
      const max = maxStakeFor(c.num.length);
      let next = c.amount + delta;
      if (next < 0) next = 0;
      if (max && next > max) next = max;
      return { ...c, amount: next };
    }));
  };

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
    const purchase = buildPurchase(betDate, cart, t('demoChannel') as string);
    const { next } = await evalPurchases([purchase, ...purchases]);
    setPurchases(next);
    setCart([]);
    const settled = next.find(p => p.id === purchase.id) ?? purchase;
    setReceipt(settled);
  };

  const closeReceipt = () => {
    setReceipt(null);
    nav.goBack();
  };

  const cartTotal = cart.reduce((sum, c) => sum + c.amount, 0);

  return (
    <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      <View style={s.card}>
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
        <View style={s.stepperRow}>
          <TouchableOpacity style={s.stepBtn}
            onPress={() => setBetAmt(v => bumpAmount(v, -AMOUNT_STEP, maxStakeFor(betNum.length || 6)))}>
            <Text style={s.stepBtnTxt}>−</Text>
          </TouchableOpacity>
          <TextInput style={[s.input, s.stepperInput]} value={betAmt}
            onChangeText={setBetAmt} keyboardType="numeric"
            placeholder="1,000" placeholderTextColor={C.muted} />
          <TouchableOpacity style={s.stepBtn}
            onPress={() => setBetAmt(v => bumpAmount(v, AMOUNT_STEP, maxStakeFor(betNum.length || 6)))}>
            <Text style={s.stepBtnTxt}>+</Text>
          </TouchableOpacity>
        </View>
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
            <ScrollView style={s.cartScroll} nestedScrollEnabled>
              {cart.map(c => (
                <View key={c.num} style={s.cartRow}>
                  <Text style={s.cartNum}>{c.num}</Text>
                  <View style={s.cartAmtStepper}>
                    <TouchableOpacity style={s.cartStepBtn} onPress={() => bumpCartAmount(c.num, -AMOUNT_STEP)}>
                      <Text style={s.cartStepBtnTxt}>−</Text>
                    </TouchableOpacity>
                    <Text style={s.cartAmt}>{c.amount.toLocaleString()}</Text>
                    <TouchableOpacity style={s.cartStepBtn} onPress={() => bumpCartAmount(c.num, AMOUNT_STEP)}>
                      <Text style={s.cartStepBtnTxt}>+</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity onPress={() => removeFromCart(c.num)}>
                    <Text style={{ fontSize: 18 }}>🗑</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
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

            <Text style={s.label}>{t('randomQtyLabel') as string}</Text>
            <TextInput style={s.input} value={rQty} onChangeText={setRQty}
              keyboardType="numeric" placeholder="10" placeholderTextColor={C.muted} />

            <Text style={s.label}>{t('betAmount') as string}</Text>
            <View style={s.stepperRow}>
              <TouchableOpacity style={s.stepBtn} onPress={() => setRAmt(v => bumpAmount(v, -AMOUNT_STEP, maxStakeFor(rDigits)))}>
                <Text style={s.stepBtnTxt}>−</Text>
              </TouchableOpacity>
              <TextInput style={[s.input, s.stepperInput]} value={rAmt} onChangeText={setRAmt}
                keyboardType="numeric" placeholder="1,000" placeholderTextColor={C.muted} />
              <TouchableOpacity style={s.stepBtn} onPress={() => setRAmt(v => bumpAmount(v, AMOUNT_STEP, maxStakeFor(rDigits)))}>
                <Text style={s.stepBtnTxt}>+</Text>
              </TouchableOpacity>
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

      {/* receipt modal */}
      <Modal visible={!!receipt} animationType="fade" transparent onRequestClose={closeReceipt}>
        <View style={s.modalOverlay}>
          <ScrollView style={s.receiptScroll} contentContainerStyle={{ paddingBottom: 24 }}>
            <View style={s.receiptCard}>
              <Text style={s.receiptCheck}>✅</Text>
              <Text style={s.receiptTitle}>{t('purchaseConfirmed') as string}</Text>
              {receipt && <Text style={s.receiptTime}>{fmtDateTime(receipt.createdAt, lang)}</Text>}
              <View style={s.receiptDivider} />
              {receipt && (
                <>
                  <View style={s.receiptRow}>
                    <Text style={s.receiptLabel}>{t('drawRoundLabel') as string}</Text>
                    <Text style={s.receiptValue}>{fmtDate(receipt.drawDate, lang)}</Text>
                  </View>
                  <View style={s.receiptTableHead}>
                    <Text style={[s.receiptTh, { flex: 1.6 }]}>{t('betNum') as string}</Text>
                    <Text style={s.receiptTh}>{t('betAmount') as string}</Text>
                  </View>
                  {receipt.lines.slice(0, 100).map(l => (
                    <View key={l.num} style={s.receiptTr}>
                      <Text style={[s.receiptTd, { flex: 1.6, fontFamily: 'Courier New' }]}>
                        {overallLineIcon(l.status)} {l.num}
                      </Text>
                      <Text style={s.receiptTd}>{l.amount.toLocaleString()} ₭</Text>
                    </View>
                  ))}
                  {receipt.lines.length > 100 && (
                    <Text style={[s.muted, { textAlign: 'center', marginTop: 6 }]}>
                      {(t('moreNumbers') as string).replace('{n}', String(receipt.lines.length - 100))}
                    </Text>
                  )}
                  <View style={s.receiptDivider} />
                  <View style={s.receiptRow}>
                    <Text style={s.receiptTotalLabel}>{t('totalCount') as string}</Text>
                    <Text style={s.receiptTotalValue}>{receipt.lines.length} {t('numbersUnit') as string}</Text>
                  </View>
                  <View style={s.receiptRow}>
                    <Text style={s.receiptTotalLabel}>{t('totalAmountLabel') as string}</Text>
                    <Text style={s.receiptTotalValue}>
                      {receipt.lines.reduce((sum, l) => sum + l.amount, 0).toLocaleString()} ₭
                    </Text>
                  </View>
                  <View style={s.receiptDivider} />
                  <Text style={s.receiptMeta}>{t('billNo') as string}: {receipt.billNo}</Text>
                  <Text style={s.receiptMeta}>{t('refNo') as string}: {receipt.refNo}</Text>
                  <Text style={s.receiptMeta}>{t('channel') as string}: {receipt.channel}</Text>
                </>
              )}
              <Text style={s.receiptDemo}>ℹ️ {t('demoNote') as string}</Text>
              <TouchableOpacity style={s.primaryBtn} onPress={closeReceipt}>
                <Text style={s.primaryBtnTxt}>{t('close') as string}</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 14 },
  hint: { color: C.muted, fontSize: 13, lineHeight: 18, marginBottom: 14 },
  label: { color: C.muted, fontSize: 13, marginBottom: 6 },
  muted: { color: C.muted, fontSize: 12 },
  input: { backgroundColor: C.input, borderRadius: 10, padding: 12, color: C.text,
    fontFamily: 'Courier New', fontSize: 18, letterSpacing: 2, marginBottom: 12 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepperInput: { flex: 1, textAlign: 'center' },
  stepBtn: { width: 44, height: 48, borderRadius: 10, backgroundColor: C.input,
    borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  stepBtnTxt: { color: C.accent, fontSize: 22, fontWeight: 'bold' },
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
  cartScroll: { maxHeight: 320 },
  cartRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: C.border, gap: 8 },
  cartNum: { flex: 1, color: C.text, fontFamily: 'Courier New', fontSize: 16, fontWeight: 'bold' },
  cartAmt: { color: C.muted, fontSize: 13, minWidth: 56, textAlign: 'center' },
  cartAmtStepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cartStepBtn: { width: 26, height: 26, borderRadius: 6, backgroundColor: C.card,
    borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  cartStepBtnTxt: { color: C.accent, fontSize: 15, fontWeight: 'bold' },
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
