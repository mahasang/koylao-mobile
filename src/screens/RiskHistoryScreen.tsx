import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import { useFocusEffect, useRoute, useNavigation } from '@react-navigation/native';
import {
  loadPurchases, evalPurchases, fmtDateTime, overallPurchaseStatus, purchaseTotal,
} from '../data/purchases';
import type { Purchase, NewWin } from '../data/purchases';
import { fmtDate } from '../utils/lottery';
import { useI18n } from '../data/i18n';
import { useAuth } from '../data/auth';
import WinCelebrationModal from '../components/WinCelebrationModal';
import TicketModal from '../components/TicketModal';
import { C } from '../theme';

export default function RiskHistoryScreen() {
  const { t, lang } = useI18n();
  const { refreshStats } = useAuth();
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
    if (winCount > 0) refreshStats();
    if (winCount + loseCount === 0) { Alert.alert('', t('noResultYet') as string); return; }
    if (newWins.length > 0) { setCelebration({ wins: newWins, total: winAmt }); return; }
    Alert.alert('', (t('checkSummary') as string)
      .replace('{win}', String(winCount)).replace('{amt}', winAmt.toLocaleString()).replace('{lose}', String(loseCount)));
  };

  const overallStatus = (p: Purchase) => overallPurchaseStatus(p, t);

  // Sends the old numbers (and stakes) to the buy screen's cart; the customer
  // still reviews and confirms there.
  const repeat = (p: Purchase) => {
    setViewing(null);
    nav.navigate('RiskBuy', { repeat: p.lines.map(l => ({ num: l.num, amount: l.amount })) });
  };

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

      <TicketModal purchase={viewing} onClose={() => setViewing(null)} onRepeat={viewing ? () => repeat(viewing) : undefined} />

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
                        <Text style={s.purchaseSub}>{p.ticketNo ? `${t('ticketNo') as string}: ${p.ticketNo}` : `${t('billNo') as string}: ${p.billNo}`}</Text>
                        <Text style={s.purchaseSub}>{t('channel') as string}: {p.channel}</Text>
                        <View style={[s.rowBetween, { marginTop: 4, marginBottom: 0 }]}>
                          <Text style={[s.purchaseStatusTxt, { color: stColor }]}>
                            {st.text} · {p.lines.length} {t('numbersUnit') as string}
                          </Text>
                          <View style={{ flexDirection: 'row', gap: 14 }}>
                            <TouchableOpacity onPress={() => repeat(p)}>
                              <Text style={s.link}>🔁 {t('repeatBtn') as string}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => setViewing(p)}>
                              <Text style={s.link}>{t('viewDetailsBtn') as string}</Text>
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
});
