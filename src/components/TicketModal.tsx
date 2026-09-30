import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { fmtDateTime, overallLineIcon, purchaseTotal } from '../data/purchases';
import type { Purchase } from '../data/purchases';
import { fmtCloseTime } from '../data/rounds';
import { fmtDate } from '../utils/lottery';
import { useI18n } from '../data/i18n';
import { C } from '../theme';

interface Props {
  purchase: Purchase | null;
  onClose: () => void;
  // Right after buying: shows the "ticket saved" header. In history it is a plain bill view.
  justSaved?: boolean;
  closesAt?: string | null;
  balanceAfter?: number | null;
  onRepeat?: () => void;               // history view: put these numbers back in the cart
}

const MAX_ROWS = 100;

// Shows a ticket exactly as the server stored it. Callers must only pass a
// purchase they have read back from the database — never one built locally.
export default function TicketModal({ purchase, onClose, justSaved, closesAt, balanceAfter, onRepeat }: Props) {
  const { t, lang } = useI18n();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!purchase?.ticketNo) return;
    await Clipboard.setStringAsync(`${purchase.ticketNo} ${purchase.verifyCode ?? ''}`.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Modal visible={!!purchase} animationType="fade" transparent onRequestClose={onClose}>
      <View style={s.overlay}>
        <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 24 }}>
          <View style={s.card}>
            <Text style={s.check}>{justSaved ? '✅' : '🎫'}</Text>
            <Text style={s.title}>{(justSaved ? t('ticketSaved') : t('ticketTitle')) as string}</Text>
            {purchase && <Text style={s.time}>{fmtDateTime(purchase.createdAt, lang)}</Text>}

            {purchase && (
              <>
                {purchase.ticketNo ? (
                  <View style={s.ticketBox}>
                    <Text style={s.boxLabel}>{t('ticketNo') as string}</Text>
                    <Text style={s.ticketNo} selectable>{purchase.ticketNo}</Text>
                    <Text style={[s.boxLabel, { marginTop: 8 }]}>{t('verifyCode') as string}</Text>
                    <Text style={s.code} selectable>
                      {(purchase.verifyCode ?? '').replace(/(.{4})(?=.)/g, '$1-')}
                    </Text>
                    <TouchableOpacity onPress={copy}>
                      <Text style={s.copy}>{copied ? t('copiedCode') as string : `📋 ${t('copyTicket') as string}`}</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <View style={s.ticketBox}>
                    <Text style={s.boxLabel}>{t('billNo') as string}</Text>
                    <Text style={s.ticketNo} selectable>{purchase.billNo}</Text>
                  </View>
                )}

                <View style={s.row}>
                  <Text style={s.label}>{t('drawRoundLabel') as string}</Text>
                  <Text style={s.value}>{fmtDate(purchase.drawDate, lang)}</Text>
                </View>
                {closesAt ? (
                  <View style={s.row}>
                    <Text style={s.label}>{t('ticketClosedAt') as string}</Text>
                    <Text style={s.value}>{fmtCloseTime(closesAt)}</Text>
                  </View>
                ) : null}

                <View style={s.tableHead}>
                  <Text style={[s.th, { flex: 1.6 }]}>{t('betNum') as string}</Text>
                  <Text style={s.th}>{t('betAmount') as string}</Text>
                </View>
                {purchase.lines.slice(0, MAX_ROWS).map(l => (
                  <View key={l.num} style={s.tr}>
                    <Text style={[s.td, { flex: 1.6, fontFamily: 'Courier New' }]}>
                      {overallLineIcon(l.status)} {l.num}
                    </Text>
                    <Text style={[s.td,
                      l.status === 'win' && { color: '#2e9e4f', fontWeight: 'bold' },
                      l.status === 'lose' && { color: '#e57373' }]}>
                      {l.status === 'win' ? `+${(l.pay ?? 0).toLocaleString()}` : l.amount.toLocaleString()} ₭
                    </Text>
                  </View>
                ))}
                {purchase.lines.length > MAX_ROWS && (
                  <Text style={[s.muted, { textAlign: 'center', marginTop: 6 }]}>
                    {(t('moreNumbers') as string).replace('{n}', String(purchase.lines.length - MAX_ROWS))}
                  </Text>
                )}

                <View style={s.divider} />
                <View style={s.row}>
                  <Text style={s.totalLabel}>{t('totalCount') as string}</Text>
                  <Text style={s.totalValue}>{purchase.lines.length} {t('numbersUnit') as string}</Text>
                </View>
                <View style={s.row}>
                  <Text style={s.totalLabel}>{t('totalAmountLabel') as string}</Text>
                  <Text style={s.totalValue}>{purchaseTotal(purchase).toLocaleString()} ₭</Text>
                </View>
                {balanceAfter != null && (
                  <View style={s.row}>
                    <Text style={s.label}>{t('ticketBalanceAfter') as string}</Text>
                    <Text style={s.value}>{balanceAfter.toLocaleString()} ₭</Text>
                  </View>
                )}
                <View style={s.divider} />
                <Text style={s.meta}>{t('refNo') as string}: {purchase.refNo}</Text>
                <Text style={s.meta}>{t('channel') as string}: {purchase.channel}</Text>
                {purchase.ticketNo && <Text style={s.hint}>{t('ticketHint') as string}</Text>}
              </>
            )}
            <Text style={s.demo}>ℹ️ {t('demoNote') as string}</Text>
            {onRepeat && (
              <TouchableOpacity style={[s.primaryBtn, s.repeatBtn]} onPress={onRepeat}>
                <Text style={s.repeatTxt}>🔁 {t('repeatBtn') as string}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.primaryBtn} onPress={onClose}>
              <Text style={s.primaryBtnTxt}>{t('close') as string}</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' },
  scroll: { maxHeight: '92%' },
  card: { backgroundColor: C.card, borderRadius: 20, padding: 24, margin: 16, alignItems: 'center' },
  check: { fontSize: 46, marginBottom: 4 },
  title: { color: C.text, fontSize: 18, fontWeight: 'bold' },
  time: { color: C.muted, fontSize: 12, marginTop: 4, marginBottom: 12 },
  ticketBox: { width: '100%', backgroundColor: C.accent + '14', borderWidth: 1, borderColor: C.accent,
    borderStyle: 'dashed', borderRadius: 14, padding: 14, alignItems: 'center', marginBottom: 12 },
  boxLabel: { color: C.muted, fontSize: 11 },
  ticketNo: { color: C.accent, fontSize: 20, fontWeight: 'bold', fontFamily: 'Courier New', letterSpacing: 1 },
  code: { color: C.text, fontSize: 18, fontWeight: 'bold', fontFamily: 'Courier New', letterSpacing: 2 },
  copy: { color: C.accent, fontSize: 12, fontWeight: 'bold', marginTop: 10 },
  divider: { height: 1, backgroundColor: C.border, width: '100%', marginVertical: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginBottom: 4 },
  label: { color: C.muted, fontSize: 13 },
  value: { color: C.text, fontSize: 13, fontWeight: 'bold' },
  tableHead: { flexDirection: 'row', width: '100%', borderBottomWidth: 1, borderBottomColor: C.border, paddingBottom: 6, marginBottom: 4, marginTop: 8 },
  th: { flex: 1, color: C.muted, fontSize: 12, fontWeight: 'bold' },
  tr: { flexDirection: 'row', width: '100%', paddingVertical: 3 },
  td: { flex: 1, color: C.text, fontSize: 13 },
  totalLabel: { color: C.text, fontSize: 14, fontWeight: 'bold' },
  totalValue: { color: C.gold, fontSize: 14, fontWeight: 'bold' },
  meta: { color: C.muted, fontSize: 11, alignSelf: 'flex-start' },
  muted: { color: C.muted, fontSize: 12 },
  hint: { color: C.muted, fontSize: 11, alignSelf: 'flex-start', marginTop: 8, lineHeight: 16 },
  demo: { color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 14, marginBottom: 16, lineHeight: 16 },
  primaryBtn: { backgroundColor: C.accent, borderRadius: 10, padding: 14, alignItems: 'center', alignSelf: 'stretch' },
  primaryBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  repeatBtn: { backgroundColor: C.violet + '22', borderWidth: 1, borderColor: C.violet, marginBottom: 10 },
  repeatTxt: { color: C.violet, fontWeight: 'bold', fontSize: 15 },
});
