import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useI18n } from '../data/i18n';
import { C } from '../theme';

export default function RiskScreen() {
  const { t } = useI18n();
  const nav = useNavigation<any>();

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      <View style={s.card}>
        <Text style={s.cardTitle}>⏰ {t('riskTitle')}</Text>
        <Text style={s.hint}>{t('riskHint') as string}</Text>
        <TouchableOpacity style={s.primaryBtn} onPress={() => nav.navigate('RiskBuy')}>
          <Text style={s.primaryBtnTxt}>🎯 {t('goBuyBtn') as string}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.menuRow}>
        <TouchableOpacity style={s.menuCard} onPress={() => nav.navigate('RiskResults')}>
          <Text style={s.menuIcon}>📅</Text>
          <Text style={s.menuTitle}>{t('resultsHistoryTitle') as string}</Text>
          <Text style={s.menuDesc}>{t('resultsHistoryDesc') as string}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.menuCard} onPress={() => nav.navigate('RiskHistory')}>
          <Text style={s.menuIcon}>📜</Text>
          <Text style={s.menuTitle}>{t('purchaseHistory') as string}</Text>
          <Text style={s.menuDesc}>{t('purchaseHistoryDesc') as string}</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 14 },
  cardTitle: { color: C.text, fontSize: 17, fontWeight: 'bold', marginBottom: 8 },
  hint: { color: C.muted, fontSize: 13, lineHeight: 18, marginBottom: 14 },
  primaryBtn: { backgroundColor: C.accent, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4 },
  primaryBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  menuRow: { flexDirection: 'row', gap: 12 },
  menuCard: { flex: 1, backgroundColor: C.card, borderRadius: 16, padding: 16, alignItems: 'center' },
  menuIcon: { fontSize: 30, marginBottom: 8 },
  menuTitle: { color: C.text, fontSize: 14, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  menuDesc: { color: C.muted, fontSize: 11, textAlign: 'center', lineHeight: 15 },
});
