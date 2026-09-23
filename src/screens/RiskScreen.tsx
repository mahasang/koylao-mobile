import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { getDraws, fetchLatestDraws, animalName, animalEmoji } from '../data/lottery';
import type { Draw } from '../data/lottery';
import { nextDrawInfo } from '../utils/lottery';
import { useI18n } from '../data/i18n';
import { C } from '../theme';

export default function RiskScreen() {
  const { t, lang } = useI18n();
  const nav = useNavigation<any>();
  const [nd, setNd] = useState(nextDrawInfo());
  const [draws, setDraws] = useState<Draw[]>(getDraws());

  useEffect(() => {
    const iv = setInterval(() => setNd(nextDrawInfo()), 1000);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    fetchLatestDraws().then(() => setDraws(getDraws())).catch(() => {});
  }, []);

  useFocusEffect(useCallback(() => { setDraws(getDraws()); }, []));

  const latest = draws[0];

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      {/* countdown */}
      <View style={s.card}>
        <Text style={s.cardTitle}>⏳ {t('nextDraw')}</Text>
        <View style={s.countRow}>
          <Text style={s.countNum}>{nd.days}</Text>
          <Text style={s.countUnit}>{t('days')}</Text>
          <Text style={s.countNum}>{String(nd.hours).padStart(2, '0')}</Text>
          <Text style={s.countUnit}>{t('hours')}</Text>
          <Text style={s.countNum}>{String(nd.minutes).padStart(2, '0')}</Text>
          <Text style={s.countUnit}>{t('minutes')}</Text>
          <Text style={s.countNum}>{String(nd.seconds).padStart(2, '0')}</Text>
          <Text style={s.countUnit}>{t('seconds')}</Text>
        </View>
        <Text style={s.muted}>{t('drawTime') as string}</Text>
      </View>

      {/* latest result */}
      {latest && (
        <View style={[s.card, s.center]}>
          <Text style={s.resultLabel}>{t('latestResult')}</Text>
          <View style={s.digitsRow}>
            {[...latest.num].map((ch, i) => (
              <Text key={i} style={[s.digit, s.digitHl]}>{ch}</Text>
            ))}
          </View>
          <View style={s.animalRow}>
            <Text style={s.animalEmoji}>{animalEmoji(latest.num.slice(-2))}</Text>
            <Text style={s.animalBadge}>{animalName(latest.num.slice(-2), lang)}</Text>
          </View>
        </View>
      )}

      {/* entry point */}
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
  center: { alignItems: 'center' },
  cardTitle: { color: C.text, fontSize: 17, fontWeight: 'bold', marginBottom: 8 },
  hint: { color: C.muted, fontSize: 13, lineHeight: 18, marginBottom: 14 },
  muted: { color: C.muted, fontSize: 12 },
  countRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 3, marginBottom: 6 },
  countNum: { color: C.accent, fontSize: 26, fontWeight: 'bold' },
  countUnit: { color: C.muted, fontSize: 12, marginRight: 10 },
  resultLabel: { color: C.muted, fontSize: 13, marginBottom: 10 },
  digitsRow: { flexDirection: 'row', gap: 5, marginBottom: 8 },
  digit: { width: 38, height: 46, backgroundColor: C.input, borderRadius: 8,
    textAlign: 'center', lineHeight: 46, color: C.muted, fontSize: 20,
    fontFamily: 'Courier New' } as any,
  digitHl: { backgroundColor: C.accent + '33', color: C.accent, borderWidth: 1, borderColor: C.accent },
  animalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  animalEmoji: { fontSize: 34 },
  animalBadge: { color: C.gold, fontWeight: 'bold', fontSize: 16 },
  primaryBtn: { backgroundColor: C.accent, borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 4 },
  primaryBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  menuRow: { flexDirection: 'row', gap: 12 },
  menuCard: { flex: 1, backgroundColor: C.card, borderRadius: 16, padding: 16, alignItems: 'center' },
  menuIcon: { fontSize: 30, marginBottom: 8 },
  menuTitle: { color: C.text, fontSize: 14, fontWeight: 'bold', textAlign: 'center', marginBottom: 4 },
  menuDesc: { color: C.muted, fontSize: 11, textAlign: 'center', lineHeight: 15 },
});
