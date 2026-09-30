import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import type { Purchase, PurchaseLine, FullLine } from '../data/purchases';
import { fmtCloseTime } from '../data/rounds';
import { ANIMAL_MAP, ANIMAL_EMOJI } from '../data/animals';
import { fmtDate } from '../utils/lottery';
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
  const { t, lang } = useI18n();
  const insets = useSafeAreaInsets();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!purchase?.ticketNo) return;
    await Clipboard.setStringAsync(`${purchase.ticketNo} ${purchase.verifyCode ?? ''}`.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const when = purchase ? new Date(purchase.createdAt) : null;
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

  const renderCell = (c: Cell | undefined, key: string) => {
    if (!c) return <View key={key} style={s.cellHalf} />;
    if (c.kind === 'full') {
      return (
        <View key={key} style={s.cellHalf}>
          <View style={s.numBox}><Text style={[s.num, s.numFull]}>{c.full.num}</Text><Text style={s.icon}>{animalIcon(c.full.num)}</Text></View>
          <View style={s.amtBox}>
            <Text style={s.fullTxt}>{t('numFull') as string}</Text>
            <Text style={s.struck}>{c.full.requested.toLocaleString()}</Text>
          </View>
        </View>
      );
    }
    const l = c.line;
    const cut = !!l.requested && l.requested > l.amount;
    return (
      <View key={key} style={s.cellHalf}>
        <View style={s.numBox}>
          <Text style={[s.num, l.status === 'win' && s.numWin, l.status === 'lose' && s.numLose]}>{l.num}</Text>
          <Text style={s.icon}>{animalIcon(l.num)}</Text>
        </View>
        <View style={s.amtBox}>
          {l.status === 'win'
            ? <Text style={s.winTxt}>+{(l.pay ?? 0).toLocaleString()}</Text>
            : <Text style={[s.amt, l.status === 'lose' && s.amtLose]}>{l.amount.toLocaleString()}</Text>}
          {cut && <Text style={s.struck}>{l.requested!.toLocaleString()}</Text>}
        </View>
      </View>
    );
  };

  return (
    <Modal visible={!!purchase} animationType="slide" onRequestClose={onClose}>
      <View style={[s.screen, { paddingTop: insets.top }]}>
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} hitSlop={12}><Text style={s.back}>←</Text></TouchableOpacity>
          <Text style={s.headerTitle}>{(justSaved ? t('billPaidTitle') : t('ticketTitle')) as string}</Text>
          <View style={{ width: 28 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}>
          {purchase && when && (
            <>
              <View style={s.checkRing}><Text style={s.checkMark}>✓</Text></View>
              <Text style={s.boughtAt}>
                {t('billBoughtAt') as string}: {p2(when.getDate())}/{p2(when.getMonth() + 1)}/{when.getFullYear()} {p2(when.getHours())}:{p2(when.getMinutes())}:{p2(when.getSeconds())}
              </Text>

              <View style={s.card}>
                <Text style={s.brand}>{t('brand') as string}  |  {t('ticketTitle') as string}</Text>
                <View style={s.dashed} />

                <View style={s.circles}>
                  <View style={s.circleBox}>
                    <Text style={[s.cLabel, { color: '#e8761a' }]}>{t('billDateLbl') as string}</Text>
                    <View style={[s.circle, { borderColor: '#e8761a' }]}>
                      <Text style={[s.cBig, { color: '#e8761a' }]}>{p2(when.getDate())}</Text>
                      <Text style={[s.cBig, { color: '#e8761a' }]}>{p2(when.getMonth() + 1)}</Text>
                    </View>
                  </View>
                  <View style={s.circleBox}>
                    <Text style={[s.cLabel, { color: '#1a5fb4' }]}>{t('billTimeLbl') as string}</Text>
                    <View style={[s.circle, { borderColor: '#1a5fb4' }]}>
                      <Text style={[s.cBig, { color: '#1a5fb4' }]}>{p2(when.getHours())}</Text>
                      <Text style={[s.cBig, { color: '#1a5fb4' }]}>{p2(when.getMinutes())}</Text>
                    </View>
                  </View>
                  <View style={s.circleBox}>
                    <Text style={[s.cLabel, { color: '#2e9e4f' }]}>{t('billStatusDone') as string}</Text>
                    <View style={[s.circle, { borderColor: '#2e9e4f' }]}><Text style={[s.cBig, { color: '#2e9e4f', fontSize: 34 }]}>✓</Text></View>
                  </View>
                </View>

                <Text style={s.round}>{t('billRoundDate') as string}: {fmtDate(purchase.drawDate, lang)}</Text>
                {closesAt ? <Text style={s.closes}>{t('ticketClosedAt') as string} {fmtCloseTime(closesAt)}</Text> : null}
                <View style={s.solid} />

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
  back: { fontSize: 24, color: C.accent, width: 28 },
  headerTitle: { color: C.accent, fontSize: 18, fontWeight: 'bold' },
  checkRing: { alignSelf: 'center', width: 120, height: 120, borderRadius: 60, borderWidth: 6, borderColor: '#2e9e4f',
    alignItems: 'center', justifyContent: 'center', marginTop: 16, backgroundColor: C.card },
  checkMark: { color: '#2e9e4f', fontSize: 72, fontWeight: 'bold', lineHeight: 84 },
  boughtAt: { textAlign: 'center', color: C.text, fontSize: 16, marginTop: 12, marginBottom: 14 },
  card: { backgroundColor: C.card, marginHorizontal: 12, padding: 14, borderWidth: 1, borderColor: C.border, borderRadius: 4 },
  brand: { textAlign: 'center', color: C.text, fontSize: 14 },
  dashed: { borderBottomWidth: 1, borderStyle: 'dashed', borderColor: C.muted, marginVertical: 8 },
  solid: { height: 1, backgroundColor: C.text, opacity: 0.8, marginVertical: 6 },
  circles: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end', marginVertical: 8 },
  circleBox: { alignItems: 'center', gap: 4 },
  cLabel: { fontSize: 13, fontWeight: 'bold' },
  circle: { width: 84, height: 84, borderRadius: 42, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  cBig: { fontSize: 22, fontWeight: 'bold', lineHeight: 26 },
  round: { textAlign: 'center', color: C.text, fontSize: 17, fontWeight: 'bold', marginTop: 10 },
  closes: { textAlign: 'center', color: C.muted, fontSize: 12, marginTop: 2, marginBottom: 4 },
  thRow: { flexDirection: 'row', alignItems: 'center' },
  th: { color: C.text, fontSize: 15 },
  row: { flexDirection: 'row', paddingVertical: 7, gap: 16 },
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
  winTxt: { color: '#2e9e4f', fontSize: 15, fontWeight: 'bold' },
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
