import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, Keyboard, Modal, Platform, ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import {
  loadPurchases, fetchPurchase, createPurchase, newPurchaseId, purchaseErrorCode, previewQuota,
} from '../data/purchases';
import type { Purchase, CartItem, Ticket } from '../data/purchases';
import { fetchRounds, isRoundOpen, msUntilClose, fmtCountdown, fmtCloseTime } from '../data/rounds';
import type { Round } from '../data/rounds';
import { maxStakeFor, fmtDate } from '../utils/lottery';
import { useI18n } from '../data/i18n';
import { useAuth } from '../data/auth';
import { fetchFlags } from '../data/flags';
import { ensurePermission } from '../lib/deviceNotifications';
import type { Flags } from '../data/flags';
import AccountModal from '../components/AccountModal';
import TicketModal from '../components/TicketModal';
import NumberSetsModal from '../components/NumberSetsModal';
import { getDraws } from '../data/lottery';
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
  const { session, stats, refreshStats } = useAuth();
  const nav = useNavigation<any>();
  const route = useRoute<any>();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [betNum, setBetNum] = useState('');
  const [betAmt, setBetAmt] = useState('1000');
  const [betDate, setBetDate] = useState('');
  const [rounds, setRounds] = useState<Round[] | null>(null);
  const [roundsFailed, setRoundsFailed] = useState(false);
  const [, setTick] = useState(0);
  const [receipt, setReceipt] = useState<{ purchase: Purchase; closesAt: string | null; balanceAfter: number | null } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [buyMsg, setBuyMsg] = useState<string | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [buying, setBuying] = useState(false);
  const [flags, setFlags] = useState<Flags | null>(null);
  const [setsOpen, setSetsOpen] = useState(false);
  const [quota, setQuota] = useState<Record<string, number> | null>(null);
  const [purchasesLoaded, setPurchasesLoaded] = useState(false);
  // Idempotency key of the purchase attempt in flight. Kept across retries so
  // a dropped connection can never charge twice; dropped when the cart changes.
  const pendingIdRef = useRef<string | null>(null);

  const [randomOpen, setRandomOpen] = useState(false);
  const [rDigits, setRDigitsState] = useState(6);
  const [rFixed, setRFixed] = useState<string[]>(Array(6).fill(''));
  const [rQty, setRQty] = useState('10');
  const [rAmt, setRAmt] = useState('1000');

  React.useEffect(() => {
    loadPurchases().then(list => { setPurchases(list); setPurchasesLoaded(true); });
  }, [session?.user?.id]);
  React.useEffect(() => { fetchFlags().then(setFlags); }, []);
  React.useEffect(() => { pendingIdRef.current = null; }, [cart, betDate]);

  const loadRounds = useCallback(() => (
    fetchRounds()
      .then(list => {
        setRoundsFailed(false);
        setRounds(list);
        setBetDate(cur => {
          const stillOpen = list.find(r => r.drawDate === cur && isRoundOpen(r));
          return stillOpen ? cur : (list.find(isRoundOpen)?.drawDate ?? '');
        });
      })
      .catch(() => setRoundsFailed(true))
  ), []);
  React.useEffect(() => { loadRounds(); }, [loadRounds]);
  React.useEffect(() => {
    const iv = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const round = rounds?.find(r => r.drawDate === betDate) ?? null;
  const roundOpen = !!round && isRoundOpen(round);

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

  // Adds numbers to the cart, skipping any already there or already bought
  // for this draw. Returns how many were added / skipped.
  const mergeIntoCart = (items: CartItem[], date: string = betDate) => {
    const have = new Set([
      ...cart.map(c => c.num),
      ...purchases.filter(p => p.drawDate === date).flatMap(p => p.lines.map(l => l.num)),
    ]);
    const fresh: CartItem[] = [];
    items.forEach(i => { if (!have.has(i.num)) { have.add(i.num); fresh.push(i); } });
    if (fresh.length > 0) setCart(prev => [...fresh, ...prev]);
    return { added: fresh.length, skipped: items.length - fresh.length };
  };

  const applySet = (items: CartItem[]) => {
    const { added, skipped } = mergeIntoCart(items);
    Alert.alert('', added === 0
      ? t('setsNothing') as string
      : (t('setsApplied') as string).replace('{n}', String(added)).replace('{skip}', String(skipped)));
    if (added > 0) setSetsOpen(false);
  };

  // "Buy again" from the history screen arrives as a route param. It only fills
  // the cart — nothing is bought until the customer confirms and pays.
  // A number can be bought only once per draw, so the numbers go to the first
  // open draw where none of them is already bought (usually not the draw the old
  // ticket was for). With items already in the cart the draw is left alone.
  const repeatParam: CartItem[] | undefined = route.params?.repeat;
  React.useEffect(() => {
    if (!repeatParam || !rounds || !betDate || !purchasesLoaded) return;
    (async () => {
      await Promise.resolve();
      const nums = repeatParam.map(i => i.num);
      const boughtOn = (d: string) =>
        new Set(purchases.filter(p => p.drawDate === d).flatMap(p => p.lines.map(l => l.num)));
      const open = rounds.filter(isRoundOpen);
      const free = open.find(r => { const b = boughtOn(r.drawDate); return nums.every(n => !b.has(n)); });
      const target = cart.length === 0 ? (free?.drawDate ?? betDate) : betDate;
      if (target !== betDate) setBetDate(target);
      const { added, skipped } = mergeIntoCart(repeatParam, target);
      nav.setParams({ repeat: undefined });
      Alert.alert('', added === 0
        ? t('repeatNone') as string
        : (t('repeatLoaded') as string)
          .replace('{n}', String(added)).replace('{skip}', String(skipped)).replace('{date}', fmtDate(target, lang)));
    })();
    // mergeIntoCart closes over the current cart/purchases on purpose: run once per repeat request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repeatParam, rounds, betDate, purchasesLoaded]);

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

  const flagsBlocked = !!flags && (flags.maintenance_mode || !flags.buy_enabled);
  const buyBlocked = flagsBlocked || !roundOpen;
  const cartTotal = cart.reduce((sum, c) => sum + c.amount, 0);
  // What would really be charged, given the quota left (equals the cart until the preview arrives).
  const estTotal = quota ? cart.reduce((sum, c) => sum + Math.min(c.amount, Math.max(quota[c.num] ?? c.amount, 0)), 0) : cartTotal;

  // Step 1: nothing is charged here — just show the customer exactly what
  // will happen and when the draw closes.
  const openReview = () => {
    if (flagsBlocked) { Alert.alert('', t('buyDisabled') as string); return; }
    if (!roundOpen) { Alert.alert('', t('errRoundClosed') as string); return; }
    if (cart.length === 0) { Alert.alert('', t('cartEmptyWarn') as string); return; }
    if (!session) { setAccountOpen(true); return; }
    setBuyMsg(null);
    setQuota(null);
    setReviewOpen(true);
    previewQuota(betDate, cart.map(c => c.num)).then(setQuota);
  };

  const showSaved = (purchase: Purchase, ticket: Ticket) => {
    setPurchases(prev => [purchase, ...prev.filter(p => p.id !== purchase.id)]);
    setCart([]);
    setReviewOpen(false);
    setBuyMsg(null);
    setReceipt({ purchase, closesAt: ticket.closesAt, balanceAfter: ticket.balanceAfter });
    refreshStats().catch(() => {});
    ensurePermission(); // first purchase is a natural moment to offer phone alerts
  };

  const errorText = (code: string): string => {
    switch (code) {
      case 'insufficient_balance': return t('insufficientBalance') as string;
      case 'round_closed': return t('errRoundClosed') as string;
      case 'invalid_draw_date': return t('errInvalidDate') as string;
      case 'buying_disabled': return t('buyDisabled') as string;
      case 'duplicate_number': return t('betDup') as string;
      case 'invalid_line': case 'empty_cart': return t('betBad') as string;
      case 'too_many_lines': return t('errTooMany') as string;
      case 'all_full': return t('errAllFull') as string;
      case 'not_signed_in': return t('errNotSignedIn') as string;
      default: return t('purchaseFailed') as string;
    }
  };

  // Step 2: the ticket only exists once create_purchase() has returned it
  // (money deducted + ticket saved in one server transaction). We then read
  // it back from the database before showing any success screen.
  const payNow = async () => {
    if (buying) return;
    const id = pendingIdRef.current ?? (pendingIdRef.current = newPurchaseId());
    setBuying(true);
    setBuyMsg(null);
    try {
      const ticket = await createPurchase(id, betDate, cart, t('demoChannel') as string);
      let saved: Purchase | null = null;
      try { saved = await fetchPurchase(id); } catch { /* fall back to the server's own ticket data below */ }
      if (saved?.ticketNo !== ticket.ticketNo) {
        // The server confirmed the bill but we can't read it back. With a quota some
        // numbers may have been cut or full, so the cart is not proof of what was
        // bought: only rebuild it when the server's totals match the cart exactly.
        if (ticket.total !== cartTotal || ticket.lineCount !== cart.length) {
          setCart([]);
          setReviewOpen(false);
          Alert.alert('', t('billSavedNoDetail') as string);
          setBuying(false);
          refreshStats().catch(() => {});
          return;
        }
        saved = {
          id, billNo: ticket.ticketNo, refNo: '—', channel: t('demoChannel') as string,
          drawDate: ticket.drawDate, createdAt: ticket.createdAt, ticketNo: ticket.ticketNo,
          verifyCode: ticket.verifyCode, lines: cart.map(c => ({ ...c, status: 'pending' as const })),
        };
      }
      showSaved(saved, ticket);
    } catch (e: any) {
      const code = purchaseErrorCode(e);
      if (code === 'unknown') {
        // We can't tell whether the server saved it (e.g. connection dropped).
        // Look before saying anything; the same id makes a retry safe either way.
        try {
          const saved = await fetchPurchase(id);
          if (saved?.ticketNo) {
            showSaved(saved, {
              id, ticketNo: saved.ticketNo, verifyCode: saved.verifyCode ?? '', drawDate: saved.drawDate,
              closesAt: round?.closesAt ?? null, createdAt: saved.createdAt, lineCount: saved.lines.length,
              total: saved.lines.reduce((sum, l) => sum + l.amount, 0), balanceAfter: null, replayed: true,
            });
            setBuying(false);
            return;
          }
          setBuyMsg(t('errUnknownNoTicket') as string);
        } catch {
          setBuyMsg(t('errUnknownCheck') as string);
        }
      } else {
        pendingIdRef.current = null;
        if (code === 'round_closed') loadRounds();
        setBuyMsg(errorText(code));
      }
    }
    setBuying(false);
  };

  const closeReceipt = () => {
    setReceipt(null);
    nav.goBack();
  };

  return (
    <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      {flags?.maintenance_mode && (
        <View style={s.maintenanceBar}>
          <Text style={s.maintenanceBarTxt}>🛠️ {t('maintenanceMode') as string}</Text>
        </View>
      )}

      {session && (
        <View style={s.balanceBar}>
          <Text style={s.balanceBarLabel}>{t('balanceLabel') as string}</Text>
          <Text style={s.balanceBarValue}>{(stats?.balance ?? 0).toLocaleString()} ₭</Text>
        </View>
      )}

      <View style={s.card}>
        <Text style={s.hint}>{t('riskHint') as string}</Text>

        {/* draw picker — closing times come from the server */}
        <Text style={s.label}>{t('betDraw')}</Text>
        {roundsFailed && (
          <View style={s.roundErr}>
            <Text style={s.roundErrTxt}>⚠️ {t('roundsLoadFail') as string}</Text>
            <TouchableOpacity onPress={loadRounds}><Text style={s.roundErrRetry}>{t('retryBtn') as string}</Text></TouchableOpacity>
          </View>
        )}
        {!rounds && !roundsFailed && <ActivityIndicator style={{ marginVertical: 12 }} color={C.accent} />}
        {rounds && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            {rounds.slice(0, 7).map(r => {
              const open = isRoundOpen(r);
              return (
                <TouchableOpacity key={r.drawDate} disabled={!open}
                  style={[s.dateChip, betDate === r.drawDate && s.dateChipOn, !open && s.dateChipClosed]}
                  onPress={() => changeBetDate(r.drawDate)}>
                  <Text style={[s.dateChipTxt, betDate === r.drawDate && s.dateChipOnTxt]}>
                    {fmtDate(r.drawDate, lang, { weekday: 'short', day: 'numeric', month: 'short' })}
                  </Text>
                  <Text style={[s.dateChipSub, betDate === r.drawDate && s.dateChipOnTxt]}>
                    {open ? fmtCloseTime(r.closesAt) : t('roundClosed') as string}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
        {round && (
          <View style={[s.closeBox, !roundOpen && s.closeBoxClosed]}>
            <Text style={s.closeBoxMain}>
              ⏰ {(t('roundCloses') as string).replace('{time}', fmtCloseTime(round.closesAt))}
            </Text>
            <Text style={s.closeBoxSub}>
              {roundOpen
                ? (t('closesIn') as string).replace('{v}', fmtCountdown(msUntilClose(round)))
                : t('errRoundClosed') as string}
            </Text>
          </View>
        )}
        {rounds && !round && !roundsFailed && <Text style={s.muted}>{t('noOpenRound') as string}</Text>}

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
          <TouchableOpacity style={[s.primaryBtn, { flex: 1 }, buyBlocked && s.btnDisabled]}
            onPress={addToCart} disabled={buyBlocked}>
            <Text style={s.primaryBtnTxt}>➕ {t('addBet')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.randomBtn, buyBlocked && s.btnDisabled]}
            onPress={() => setSetsOpen(true)} disabled={buyBlocked}>
            <Text style={s.randomBtnTxt}>📚 {t('setsBtn')}</Text>
          </TouchableOpacity>
          {flags?.random_generator_enabled !== false && (
            <TouchableOpacity style={[s.randomBtn, buyBlocked && s.btnDisabled]}
              onPress={() => setRandomOpen(true)} disabled={buyBlocked}>
              <Text style={s.randomBtnTxt}>🎲 {t('riskRandomBtn')}</Text>
            </TouchableOpacity>
          )}
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
            <TouchableOpacity style={[s.confirmPurchaseBtn, buyBlocked && s.btnDisabled]}
              onPress={openReview} disabled={buyBlocked}>
              <Text style={s.primaryBtnTxt}>✅ {t('confirmPurchaseBtn')}</Text>
            </TouchableOpacity>
            {!session && (
              <Text style={[s.muted, { textAlign: 'center', marginTop: 8 }]}>🔒 {t('loginRequiredMsg') as string}</Text>
            )}
            {flagsBlocked && (
              <Text style={[s.muted, { textAlign: 'center', marginTop: 8 }]}>⛔ {t('buyDisabled') as string}</Text>
            )}
            {!flagsBlocked && !roundOpen && (
              <Text style={[s.muted, { textAlign: 'center', marginTop: 8 }]}>⛔ {t('errRoundClosed') as string}</Text>
            )}
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

      <NumberSetsModal
        visible={setsOpen}
        onClose={() => setSetsOpen(false)}
        draws={getDraws()}
        cart={cart}
        stake={parseInt(betAmt.replace(/\D/g, ''), 10) || AMOUNT_STEP}
        onApply={applySet}
      />

      {/* review before paying */}
      <Modal visible={reviewOpen} animationType="slide" transparent onRequestClose={() => !buying && setReviewOpen(false)}>
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>🧾 {t('reviewTitle') as string}</Text>
            <View style={s.revRow}><Text style={s.revLabel}>{t('reviewRound') as string}</Text>
              <Text style={s.revValue}>{betDate ? fmtDate(betDate, lang) : '—'}</Text></View>
            {round && (
              <View style={s.revRow}><Text style={s.revLabel}>{t('reviewClose') as string}</Text>
                <Text style={s.revValue}>
                  {fmtCloseTime(round.closesAt)} · {roundOpen ? fmtCountdown(msUntilClose(round)) : t('roundClosed') as string}
                </Text></View>
            )}
            <View style={s.revRow}><Text style={s.revLabel}>{t('reviewCount') as string}</Text>
              <Text style={s.revValue}>{cart.length} {t('numbersUnit') as string}</Text></View>
            <ScrollView style={s.revList} nestedScrollEnabled>
              {cart.slice(0, 50).map(c => {
                const left = quota ? quota[c.num] : undefined;
                const full = left !== undefined && left <= 0;
                const part = left !== undefined && left > 0 && left < c.amount;
                return (
                  <View key={c.num} style={s.revLine}>
                    <Text style={[s.revNum, full && s.revFull]}>{c.num}</Text>
                    <Text style={[s.revAmt, full && s.revFull, part && s.revPart]}>
                      {full ? t('numFull') as string
                        : part ? `${left!.toLocaleString()} / ${c.amount.toLocaleString()} ₭`
                        : `${c.amount.toLocaleString()} ₭`}
                    </Text>
                  </View>
                );
              })}
              {cart.length > 50 && (
                <Text style={[s.muted, { textAlign: 'center', marginTop: 4 }]}>
                  {(t('moreNumbers') as string).replace('{n}', String(cart.length - 50))}
                </Text>
              )}
            </ScrollView>
            <View style={s.revRow}><Text style={s.revTotalLabel}>{t('reviewTotal') as string}</Text>
              <Text style={s.revTotal}>{estTotal.toLocaleString()} ₭</Text></View>
            {estTotal !== cartTotal && (
              <Text style={s.revPartNote}>{(t('reviewAskedFor') as string).replace('{v}', cartTotal.toLocaleString())}</Text>
            )}
            <View style={s.revRow}><Text style={s.revLabel}>{t('reviewBalanceNow') as string}</Text>
              <Text style={s.revValue}>{(stats?.balance ?? 0).toLocaleString()} ₭</Text></View>
            <View style={s.revRow}><Text style={s.revLabel}>{t('reviewBalanceAfter') as string}</Text>
              <Text style={[s.revValue, (stats?.balance ?? 0) < estTotal && { color: '#e57373' }]}>
                {((stats?.balance ?? 0) - estTotal).toLocaleString()} ₭
              </Text></View>

            {quota && <Text style={s.revWarn}>ℹ️ {t('reviewQuotaNote') as string}</Text>}
            {quota && estTotal === 0 && <Text style={s.revErr}>{t('errAllFull') as string}</Text>}
            <Text style={s.revWarn}>⚠️ {t('reviewWarn') as string}</Text>
            {buyMsg && <Text style={s.revErr}>{buyMsg}</Text>}

            <View style={s.rowGap}>
              <TouchableOpacity style={[s.cancelBtn, { flex: 1 }]} disabled={buying} onPress={() => setReviewOpen(false)}>
                <Text style={s.cancelBtnTxt}>{t('backToCart') as string}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.confirmPurchaseBtn, { flex: 1.4, marginTop: 4 },
                  (buying || !roundOpen || estTotal === 0 || (stats?.balance ?? 0) < estTotal) && s.btnDisabled]}
                disabled={buying || !roundOpen || estTotal === 0 || (stats?.balance ?? 0) < estTotal} onPress={payNow}>
                {buying
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={s.primaryBtnTxt}>{t('payNow') as string}</Text>}
              </TouchableOpacity>
            </View>
            {buying && <Text style={[s.muted, { textAlign: 'center', marginTop: 8 }]}>{t('processing') as string}</Text>}
          </View>
        </View>
      </Modal>

      {/* ticket — only ever shown for a ticket the server has issued */}
      <TicketModal
        purchase={receipt?.purchase ?? null}
        justSaved
        closesAt={receipt?.closesAt}
        balanceAfter={receipt?.balanceAfter}
        onClose={closeReceipt}
      />

      <AccountModal visible={accountOpen} onClose={() => setAccountOpen(false)} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 14 },
  balanceBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: C.accent + '18', borderWidth: 1, borderColor: C.accent,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14 },
  balanceBarLabel: { color: C.muted, fontSize: 12 },
  balanceBarValue: { color: C.accent, fontWeight: 'bold', fontSize: 16 },
  maintenanceBar: { backgroundColor: '#7c2020', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14 },
  maintenanceBarTxt: { color: '#fff', fontWeight: 'bold', fontSize: 13, textAlign: 'center' },
  btnDisabled: { opacity: 0.4 },
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
  dateChipClosed: { opacity: 0.4 },
  dateChipSub: { color: C.muted, fontSize: 10, marginTop: 2, textAlign: 'center' },
  roundErr: { backgroundColor: '#FCEAEA', borderWidth: 1, borderColor: '#e57373', borderRadius: 10, padding: 12, marginBottom: 10 },
  roundErrTxt: { color: '#c0392b', fontSize: 12, lineHeight: 17 },
  roundErrRetry: { color: C.accent, fontWeight: 'bold', fontSize: 13, marginTop: 6 },
  closeBox: { backgroundColor: C.accent + '14', borderWidth: 1, borderColor: C.accent, borderRadius: 12,
    padding: 12, marginBottom: 14, alignItems: 'center' },
  closeBoxClosed: { backgroundColor: '#FCEAEA', borderColor: '#e57373' },
  closeBoxMain: { color: C.text, fontWeight: 'bold', fontSize: 14 },
  closeBoxSub: { color: C.accent, fontWeight: 'bold', fontSize: 18, marginTop: 4, fontFamily: 'Courier New' },
  revRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  revLabel: { color: C.muted, fontSize: 13 },
  revValue: { color: C.text, fontSize: 13, fontWeight: 'bold' },
  revList: { maxHeight: 160, backgroundColor: C.input, borderRadius: 10, padding: 8, marginVertical: 8 },
  revLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  revNum: { color: C.text, fontFamily: 'Courier New', fontSize: 14, fontWeight: 'bold' },
  revAmt: { color: C.muted, fontSize: 13 },
  revTotalLabel: { color: C.text, fontSize: 15, fontWeight: 'bold' },
  revTotal: { color: C.gold, fontSize: 17, fontWeight: 'bold' },
  revFull: { color: '#c0392b' },
  revPart: { color: '#b57a00', fontWeight: 'bold' },
  revPartNote: { color: '#b57a00', fontSize: 11, textAlign: 'right', marginTop: -2, marginBottom: 6 },
  revWarn: { color: C.muted, fontSize: 11, lineHeight: 16, marginTop: 8, marginBottom: 8 },
  revErr: { color: '#c0392b', fontSize: 12, lineHeight: 17, marginBottom: 8, backgroundColor: '#FCEAEA', padding: 10, borderRadius: 8 },
});
