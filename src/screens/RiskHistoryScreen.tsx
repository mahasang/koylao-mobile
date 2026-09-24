import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, Modal } from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import {
  loadPurchases, evalPurchases, fmtDateTime, overallLineIcon, overallPurchaseStatus, purchaseTotal,
} from '../data/purchases';
import type { Purchase, NewWin } from '../data/purchases';
import { fmtDate } from '../utils/lottery';
import { useI18n } from '../data/i18n';
import WinCelebrationModal from '../components/WinCelebrationModal';
import { C } from '../theme';

export default function RiskHistoryScreen() {
  const { t, lang } = useI18n();
  const route = useRoute<any>();
  const nav = useNavigation<any>();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [viewing, setViewing] = useState<Purchase | null>(null);
  const [celebration, setCelebration] = useState<{ wins: NewWin[]; total: number } | null>(null);

  useFocusEffect(useCallback(() => {
    loadPurchases().then(list => {
      setPurchases(list);
      const openId = route.params?.openId;
      if (openId) {
        const match = list.find(p => p.id === openId);
        if (match) setViewing(match);
        nav.setParams({ openId: undefined });
      }
    });
  }, [route.params?.openId]));

  const checkNow = async () => {
    const { next, winCount, loseCount, winAmt, newWins } = await evalPurchases(purchases);
    setPurchases(next);
    if (winCount + loseCount === 0) { Alert.alert('', t('noResultYet') as string); return; }
    if (newWins.length > 0) { setCelebration({ wins: newWins, total: winAmt }); return; }
    Alert.alert('', (t('checkSummary') as string)
      .replace('{win}', String(winCount)).replace('{amt}', winAmt.toLocaleString()).replace('{lose}', String(loseCount)));
  };

  const overallStatus = (p: Purchase) => overallPurchaseStatus(p, t);

  const groupedDates = [...new Set(purchases.map(p => p.drawDate))].sort((a, b) => b.localeCompare(a));

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      {celebration && (
        <WinCelebrationModal
          visible
          wins={celebration.wins}
          totalAmt={celebration.total}
          onClose={() => setCelebration(null)}
        />
      )}

      {/* bill detail modal */}
      <Modal visible={!!viewing} animationType="fade" transparent onRequestClose={() => setViewing(null)}>
        <View style={s.modalOverlay}>
          <ScrollView style={s.receiptScroll} contentContainerStyle={{ paddingBottom: 24 }}>
            <View style={s.receiptCard}>
              <Text style={s.receiptCheck}>🧾</Text>
              <Text style={s.receiptTitle}>{t('billDetails') as string}</Text>
              {viewing && <Text style={s.receiptTime}>{fmtDateTime(viewing.createdAt, lang)}</Text>}
              <View style={s.receiptDivider} />
              {viewing && (
                <>
                  <View style={s.receiptRow}>
                    <Text style={s.receiptLabel}>{t('drawRoundLabel') as string}</Text>
                    <Text style={s.receiptValue}>{fmtDate(viewing.drawDate, lang)}</Text>
                  </View>
                  <View style={s.receiptTableHead}>
                    <Text style={[s.receiptTh, { flex: 1.6 }]}>{t('betNum') as string}</Text>
                    <Text style={s.receiptTh}>{t('betAmount') as string}</Text>
                  </View>
                  {viewing.lines.slice(0, 100).map(l => (
                    <View key={l.num} style={s.receiptTr}>
                      <Text style={[s.receiptTd, { flex: 1.6, fontFamily: 'Courier New' }]}>
                        {overallLineIcon(l.status)} {l.num}
                      </Text>
                      <Text style={[s.receiptTd,
                        l.status === 'win' && { color: '#2e9e4f', fontWeight: 'bold' },
                        l.status === 'lose' && { color: '#e57373' }]}>
                        {l.status === 'win' ? `+${(l.pay ?? 0).toLocaleString()}` : l.amount.toLocaleString()} ₭
                      </Text>
                    </View>
                  ))}
                  {viewing.lines.length > 100 && (
                    <Text style={[s.muted, { textAlign: 'center', marginTop: 6 }]}>
                      {(t('moreNumbers') as string).replace('{n}', String(viewing.lines.length - 100))}
                    </Text>
                  )}
                  <View style={s.receiptDivider} />
                  <View style={s.receiptRow}>
                    <Text style={s.receiptTotalLabel}>{t('totalCount') as string}</Text>
                    <Text style={s.receiptTotalValue}>{viewing.lines.length} {t('numbersUnit') as string}</Text>
                  </View>
                  <View style={s.receiptRow}>
                    <Text style={s.receiptTotalLabel}>{t('totalAmountLabel') as string}</Text>
                    <Text style={s.receiptTotalValue}>
                      {viewing.lines.reduce((sum, l) => sum + l.amount, 0).toLocaleString()} ₭
                    </Text>
                  </View>
                  <View style={s.receiptDivider} />
                  <Text style={s.receiptMeta}>{t('billNo') as string}: {viewing.billNo}</Text>
                  <Text style={s.receiptMeta}>{t('refNo') as string}: {viewing.refNo}</Text>
                  <Text style={s.receiptMeta}>{t('channel') as string}: {viewing.channel}</Text>
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
                  const totalAmt = purchaseTotal(p);
                  const st = overallStatus(p);
                  const stColor = st.state === 'win' ? '#2e9e4f' : st.state === 'lose' ? '#e57373' : C.muted;
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
                          <Text style={[s.purchaseStatusTxt, { color: stColor }]}>
                            {st.text} · {p.lines.length} {t('numbersUnit') as string}
                          </Text>
                          <TouchableOpacity onPress={() => setViewing(p)}>
                            <Text style={s.link}>{t('viewDetailsBtn') as string}</Text>
                          </TouchableOpacity>
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
  muted: { color: C.muted, fontSize: 12 },
  primaryBtn: { backgroundColor: C.accent, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4 },
  primaryBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
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
  modalOverlay: { flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' },
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
