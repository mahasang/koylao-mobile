import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, StatusBar, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import type { Purchase, PurchaseLine, FullLine } from '../data/purchases';
import { prizeId } from '../utils/lottery';
import { fmtCloseTime } from '../data/rounds';
import { ANIMAL_MAP, ANIMAL_EMOJI } from '../data/animals';
import { getDraws, fetchLatestDraws } from '../data/lottery';
import { useI18n } from '../data/i18n';
import { C } from '../theme';

interface Props {
  purchase: Purchase | null;
  onClose: () => void;
  // Right after buying: the "payment done" header. In history it is a plain bill view.
  justSaved?: boolean;
  closesAt?: string | null;
  balanceAfter?: number | null;
  onRepeat?: () => void;               // history view: put these numbers back in the cart
}

const MAX_CELLS = 300;
const p2 = (n: number) => String(n).padStart(2, '0');

// One cell of the number table: the number, what was bought, and — when a quota
// cut it short — what was asked for, struck through. Full numbers say so.
type Cell =
  | { kind: 'line'; line: PurchaseLine }
  | { kind: 'full'; full: FullLine };

function animalIcon(num: string): string {
  const key = ANIMAL_MAP[num.slice(-2).padStart(2, '0')];
  return key ? ANIMAL_EMOJI[key] : '🐾';
}

// Shows a bill exactly as the server stored it. Callers must only pass a purchase
// they have read back from the database — never one built locally.
export default function TicketModal({ purchase, onClose, justSaved, closesAt, balanceAfter, onRepeat }: Props) {
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);
  const [, setDrawsTick] = useState(0);

  // The result may have come out since the app last loaded results.
  const drawDate = purchase?.drawDate;
  React.useEffect(() => {
    if (!drawDate) return;
    fetchLatestDraws().then(() => setDrawsTick(n => n + 1)).catch(() => {});
  }, [drawDate]);

  const copy = async () => {
    if (!purchase?.ticketNo) return;
    await Clipboard.setStringAsync(`${purchase.ticketNo} ${purchase.verifyCode ?? ''}`.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const when = purchase ? new Date(purchase.createdAt) : null;
  const draw = purchase ? getDraws().find(d => d.date === purchase.drawDate) : undefined;
  const resultNum = draw && draw.status !== 'pending' ? draw.num : null;   // bundled history has no status: already final
  const numericDate = (iso: string) => { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}`; };
  const fullLines = purchase?.fullLines ?? [];
  const partial = purchase ? purchase.lines.filter(l => l.requested && l.requested > l.amount) : [];

  const cells: Cell[] = purchase
    ? [
        ...purchase.lines.map(l => ({ kind: 'line' as const, line: l, num: l.num })),
        ...fullLines.map(f => ({ kind: 'full' as const, full: f, num: f.num })),
      ].sort((a, b) => a.num.localeCompare(b.num)).map(({ num: _n, ...c }) => c as Cell)
    : [];
  const shown = cells.slice(0, MAX_CELLS);
  const rows: Cell[][] = [];
  for (let i = 0; i < shown.length; i += 2) rows.push(shown.slice(i, i + 2));

  const total = purchase ? purchase.lines.reduce((sum, l) => sum + l.amount, 0) : 0;

  // Prizes already paid into the wallet for this bill, grouped by how many digits matched.
  const wins = purchase ? purchase.lines.filter(l => l.status === 'win') : [];
  const winTotal = wins.reduce((sum, l) => sum + (l.pay ?? 0), 0);
  const hasJackpot = wins.some(l => l.hit === 6);
  const prizeGroups = Object.values(wins.reduce((acc: Record<number, { hit: number; count: number; pay: number }>, l) => {
    const hit = l.hit ?? 0;
    acc[hit] = acc[hit] ?? { hit, count: 0, pay: 0 };
    acc[hit].count += 1;
    acc[hit].pay += l.pay ?? 0;
    return acc;
  }, {})).sort((a, b) => b.hit - a.hit);
  const prizeName = (hit?: number | null) => (hit ? (t(`p_${prizeId(hit)}`) as string) : '');

  const renderCell = (c: Cell | undefined, key: string) => {
    if (!c) return <View key={key} style={s.cellWrap} />;
    if (c.kind === 'full') {
      return (
        <View key={key} style={s.cellWrap}>
          <View style={s.cellTop}>
            <View style={s.numBox}><Text style={[s.num, s.numFull]}>{c.full.num}</Text><Text style={s.icon}>{animalIcon(c.full.num)}</Text></View>
            <View style={s.amtBox}>
              <Text style={s.fullTxt}>{t('numFull') as string}</Text>
              <Text style={s.struck}>{c.full.requested.toLocaleString()}</Text>
            </View>
          </View>
        </View>
      );
    }
    const l = c.line;
    const cut = !!l.requested && l.requested > l.amount;
    const won = l.status === 'win';
    return (
      <View key={key} style={s.cellWrap}>
        <View style={s.cellTop}>
          <View style={s.numBox}>
            <Text style={[s.num, won && s.numWin, l.status === 'lose' && s.numLose]}>{l.num}</Text>
            <Text style={s.icon}>{animalIcon(l.num)}</Text>
          </View>
          <View style={s.amtBox}>
            <Text style={[s.amt, l.status === 'lose' && s.amtLose]}>{l.amount.toLocaleString()}</Text>
            {cut && <Text style={s.struck}>{l.requested!.toLocaleString()}</Text>}
          </View>
        </View>
        {won && (
          <View style={[s.winChip, l.hit === 6 && s.winChipJackpot]}>
            <Text style={s.winChipName}>{l.hit === 6 ? '🎁' : '🏆'} {prizeName(l.hit)}</Text>
            <Text style={s.winChipPay}>+{(l.pay ?? 0).toLocaleString()} ₭</Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal visible={!!purchase} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={s.screen}>
        <StatusBar barStyle="light-content" />
        <ScrollView contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}>
          {purchase && when && (
            <>
              {wins.length > 0 ? (
                <LinearGradient colors={['#ffcf4a', '#e8801f', '#c94f13']} style={[s.hero, s.winHero, { paddingTop: insets.top + 16 }]}>
                  <TouchableOpacity style={[s.heroClose, { top: insets.top + 8 }]} onPress={onClose} hitSlop={12}>
                    <Text style={s.heroCloseTxt}>✕</Text>
                  </TouchableOpacity>
                  <Text style={[s.spark, { left: 28, top: insets.top + 70 }]}>✦</Text>
                  <Text style={[s.spark, { right: 34, top: insets.top + 120, fontSize: 18 }]}>✧</Text>
                  <Text style={[s.spark, { right: 70, top: insets.top + 36, fontSize: 14 }]}>✦</Text>
                  <Image source={require('../../assets/icon.png')} style={s.avatar} />
                  <Text style={s.congrats}>🎉 {t('winCongrats') as string} 🎉</Text>
                  <View style={s.ribbon}>
                    <Text style={s.ribbonTxt}>{(hasJackpot ? t('winJackpotMsg') : t('winYouWon')) as string}</Text>
                  </View>
                  <Text style={s.winLabel}>{t('winProfitBack') as string}</Text>
                  <Text style={s.winAmt}>+{winTotal.toLocaleString()} ₭</Text>
                  <Text style={s.winSub}>{t('winProfitSub') as string}</Text>
                  <View style={[s.heroCols, { marginTop: 18, alignSelf: "stretch" }]}>
                    <View>
                      <Text style={s.heroLabel}>{t('billDrawsOn') as string}</Text>
                      <Text style={s.heroDate}>{numericDate(purchase.drawDate)}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={s.heroLabel}>{t('billResultOut') as string}</Text>
                      <Text style={s.heroResult}>{resultNum ?? '—'}</Text>
                    </View>
                  </View>
                </LinearGradient>
              ) : (
                <LinearGradient colors={['#ff0000', '#9b0000']} style={[s.hero, { paddingTop: insets.top + 16 }]}>
                <TouchableOpacity style={[s.heroClose, { top: insets.top + 8 }]} onPress={onClose} hitSlop={12}>
                  <Text style={s.heroCloseTxt}>✕</Text>
                </TouchableOpacity>
                <View style={s.heroMsgRow}>
                  <View style={s.heroCheck}><Text style={s.heroCheckTxt}>✓</Text></View>
                  <Text style={s.heroMsg}>{(justSaved ? t('billLuckMsg') : t('ticketTitle')) as string}</Text>
                </View>
                <View style={s.heroCols}>
                  <View>
                    <Text style={s.heroLabel}>{t('billDrawsOn') as string}</Text>
                    <Text style={s.heroDate}>{numericDate(purchase.drawDate)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
                    <Text style={s.heroLabel}>{t('billResultOut') as string}</Text>
                    {resultNum
                      ? <Text style={s.heroResult}>{resultNum}</Text>
                      : <Text style={s.heroPending}>
                          {(draw?.status === 'pending' ? t('billResultPending') : t('billResultNotYet')) as string}
                        </Text>}
                  </View>
                </View>
                </LinearGradient>
              )}

              <View style={[s.card, s.cardOverlap]}>
                <View style={s.infoRow}>
                  <Text style={s.infoTxt}>
                    {t('billBoughtAt') as string}: {p2(when.getHours())}:{p2(when.getMinutes())}:{p2(when.getSeconds())} {p2(when.getDate())}/{p2(when.getMonth() + 1)}/{when.getFullYear()}
                  </Text>
                  <Text style={s.infoOk}>✓ {t('billPaidOk') as string}</Text>
                </View>
                <View style={s.dashed} />
                <View style={s.infoRow}>
                  <Text style={s.infoTxt}>{t('billRoundDate') as string}: {numericDate(purchase.drawDate)}</Text>
                  {closesAt ? <Text style={s.closes}>{t('ticketClosedAt') as string} {fmtCloseTime(closesAt)}</Text> : null}
                </View>
                <View style={s.solid} />

                {prizeGroups.length > 0 && (
                  <View style={s.prizeBox}>
                    <Text style={s.prizeTitle}>🏆 {t('winBreakdown') as string}</Text>
                    {prizeGroups.map(g => (
                      <View key={g.hit} style={s.prizeRow}>
                        <Text style={s.prizeName}>{prizeName(g.hit)} × {g.count}</Text>
                        <Text style={s.prizePay}>+{g.pay.toLocaleString()} ₭</Text>
                      </View>
                    ))}
                    <View style={s.prizeRow}>
                      <Text style={s.prizeSum}>{t('winProfitBack') as string}</Text>
                      <Text style={s.prizeSum}>+{winTotal.toLocaleString()} ₭</Text>
                    </View>
                  </View>
                )}

                <View style={s.row}>
                  {[0, 1].map(k => (
                    <View key={k} style={s.cellHalf}>
                      <Text style={s.th}>{t('colNum') as string}</Text>
                      <Text style={s.th}>{t('colAmt') as string}</Text>
                    </View>
                  ))}
                </View>
                <View style={s.solid} />

                {rows.map((row, i) => (
                  <View key={i} style={s.row}>
                    {renderCell(row[0], `${i}a`)}
                    {renderCell(row[1], `${i}b`)}
                  </View>
                ))}
                {cells.length > MAX_CELLS && (
                  <Text style={s.more}>{(t('moreNumbers') as string).replace('{n}', String(cells.length - MAX_CELLS))}</Text>
                )}

                <View style={s.solid} />
                <View style={s.totals}>
                  <Text style={s.totalL}>{(t('billCount') as string).replace('{n}', String(purchase.lines.length))}</Text>
                  <Text style={s.totalR}>{(t('billSum') as string).replace('{v}', total.toLocaleString())}</Text>
                </View>
                <View style={s.solid} />

                <Text style={s.meta}>{t('ticketNo') as string}: <Text style={s.metaStrong} selectable>{purchase.ticketNo ?? purchase.billNo}</Text></Text>
                {purchase.verifyCode ? (
                  <Text style={s.meta}>
                    {t('verifyCode') as string}: <Text style={s.metaStrong} selectable>{purchase.verifyCode.replace(/(.{4})(?=.)/g, '$1-')}</Text>
                  </Text>
                ) : null}
                <Text style={s.meta}>{t('refNo') as string}: {purchase.refNo}</Text>
                <Text style={s.meta}>{t('channel') as string}: {purchase.channel}</Text>
                {balanceAfter != null && (
                  <Text style={s.meta}>{t('ticketBalanceAfter') as string}: {balanceAfter.toLocaleString()} ₭</Text>
                )}
                {purchase.ticketNo ? (
                  <TouchableOpacity onPress={copy}>
                    <Text style={s.copy}>{copied ? t('copiedCode') as string : `📋 ${t('copyTicket') as string}`}</Text>
                  </TouchableOpacity>
                ) : null}

                {fullLines.length > 0 && (
                  <Text style={s.alert}>
                    {t('billFullNums') as string} {fullLines.map(f => f.num).join(', ')}
                  </Text>
                )}
                {partial.length > 0 && (
                  <Text style={s.alert}>
                    {t('billPartialNums') as string} {partial.map(l => l.num).join(', ')}
                  </Text>
                )}
              </View>

              {purchase.ticketNo ? <Text style={s.hint}>{t('ticketHint') as string}</Text> : null}
              <Text style={s.demo}>ℹ️ {t('demoNote') as string}</Text>

              {onRepeat && (
                <TouchableOpacity style={[s.btn, s.repeatBtn]} onPress={onRepeat}>
                  <Text style={s.repeatTxt}>🔁 {t('repeatBtn') as string}</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={s.btn} onPress={onClose}>
                <Text style={s.btnTxt}>{t('close') as string}</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16,
    paddingVertical: 14, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border },
  checkRing: { alignSelf: 'center', width: 120, height: 120, borderRadius: 60, borderWidth: 6, borderColor: '#2e9e4f',
    alignItems: 'center', justifyContent: 'center', marginTop: 16, backgroundColor: C.card },
  hero: { paddingHorizontal: 20, paddingBottom: 54 },
  heroClose: { position: 'absolute', right: 16, width: 30, height: 30, borderRadius: 15, backgroundColor: '#ffffff33',
    alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  heroCloseTxt: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  heroMsgRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 36, marginBottom: 22 },
  heroCheck: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  heroCheckTxt: { color: '#2e9e4f', fontSize: 20, fontWeight: 'bold' },
  heroMsg: { color: '#fff', fontSize: 17, fontWeight: 'bold', flexShrink: 1, lineHeight: 24 },
  heroCols: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  winHero: { paddingBottom: 60, alignItems: 'center' },
  spark: { position: 'absolute', color: '#fff', fontSize: 22, opacity: 0.9 },
  avatar: { width: 76, height: 76, borderRadius: 38, borderWidth: 3, borderColor: '#fff', marginBottom: 10 },
  congrats: { color: '#fff', fontSize: 17, fontWeight: 'bold', marginBottom: 12 },
  ribbon: { backgroundColor: '#fff', borderRadius: 22, paddingHorizontal: 26, paddingVertical: 8, marginBottom: 12 },
  ribbonTxt: { color: '#c94f13', fontSize: 18, fontWeight: 'bold' },
  winLabel: { color: '#fff', fontSize: 14, opacity: 0.95 },
  winAmt: { color: '#fff', fontSize: 38, fontWeight: 'bold', marginTop: 2 },
  winSub: { color: '#fff', fontSize: 12, opacity: 0.9, marginTop: 2 },
  prizeBox: { backgroundColor: '#fff8e1', borderWidth: 1, borderColor: '#f0c040', borderRadius: 12, padding: 12, marginBottom: 10 },
  prizeTitle: { color: '#8a5a00', fontWeight: 'bold', fontSize: 14, marginBottom: 6 },
  prizeRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2, gap: 8 },
  prizeName: { color: C.text, fontSize: 14, flexShrink: 1 },
  prizePay: { color: '#2e9e4f', fontSize: 14, fontWeight: 'bold' },
  prizeSum: { color: '#8a5a00', fontSize: 14, fontWeight: 'bold', marginTop: 4 },
  heroLabel: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  heroDate: { color: '#ffd600', fontSize: 20, fontWeight: 'bold', marginTop: 4 },
  heroResult: { color: '#ffd600', fontSize: 22, fontWeight: 'bold', marginTop: 4, letterSpacing: 4, fontFamily: 'Courier New' },
  heroPending: { color: '#ffffffcc', fontSize: 13, marginTop: 6, textAlign: 'right' },
  card: { backgroundColor: C.card, marginHorizontal: 12, padding: 14, borderWidth: 1, borderColor: C.border, borderRadius: 8 },
  cardOverlap: { marginTop: -34 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  infoTxt: { color: C.text, fontSize: 14, flexShrink: 1 },
  infoOk: { color: '#2e9e4f', fontSize: 14, fontWeight: 'bold' },
  dashed: { borderBottomWidth: 1, borderStyle: 'dashed', borderColor: C.muted, marginVertical: 8 },
  solid: { height: 1, backgroundColor: C.text, opacity: 0.8, marginVertical: 6 },
  closes: { textAlign: 'center', color: C.muted, fontSize: 12, marginTop: 2, marginBottom: 4 },
  thRow: { flexDirection: 'row', alignItems: 'center' },
  th: { color: C.text, fontSize: 15 },
  row: { flexDirection: 'row', paddingVertical: 7, gap: 16 },
  cellWrap: { flex: 1 },
  cellTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 },
  winChip: { marginTop: 4, backgroundColor: '#e6f4ea', borderWidth: 1, borderColor: '#2e9e4f', borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4 },
  winChipJackpot: { backgroundColor: '#fff3cd', borderColor: '#e8a020' },
  winChipName: { color: '#1b5e20', fontSize: 12 },
  winChipPay: { color: '#1b7a36', fontSize: 15, fontWeight: 'bold' },
  cellHalf: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 6 },
  numBox: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  num: { color: C.text, fontFamily: 'Courier New', fontSize: 17, letterSpacing: 0.5 },
  numFull: { color: '#c0392b' },
  numWin: { color: '#2e9e4f', fontWeight: 'bold' },
  numLose: { color: '#c0392b' },
  icon: { fontSize: 18 },
  amtBox: { alignItems: 'flex-end', flexShrink: 0 },
  amt: { color: C.text, fontSize: 17 },
  amtLose: { color: '#c0392b' },
  fullTxt: { color: '#c0392b', fontSize: 15 },
  struck: { color: C.muted, fontSize: 13, textDecorationLine: 'line-through' },
  more: { textAlign: 'center', color: C.muted, fontSize: 12, marginTop: 6 },
  totals: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalL: { color: C.text, fontSize: 16, fontWeight: 'bold' },
  totalR: { color: C.text, fontSize: 18, fontWeight: 'bold' },
  meta: { color: C.text, fontSize: 14, marginTop: 6, lineHeight: 20 },
  metaStrong: { fontFamily: 'Courier New', fontWeight: 'bold', color: C.accent },
  copy: { color: C.accent, fontSize: 12, fontWeight: 'bold', marginTop: 10 },
  alert: { color: '#b71c1c', fontSize: 15, fontWeight: 'bold', marginTop: 14, lineHeight: 22 },
  hint: { color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 12, marginHorizontal: 16, lineHeight: 16 },
  demo: { color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 8, marginBottom: 16, marginHorizontal: 16, lineHeight: 16 },
  btn: { backgroundColor: C.accent, borderRadius: 10, padding: 14, alignItems: 'center', marginHorizontal: 16, marginBottom: 10 },
  btnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  repeatBtn: { backgroundColor: C.violet + '22', borderWidth: 1, borderColor: C.violet },
  repeatTxt: { color: C.violet, fontWeight: 'bold', fontSize: 15 },
});
