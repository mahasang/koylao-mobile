import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Modal, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { DRAWS, animalName } from '../data/lottery';
import { nextDrawInfo, fmtDate } from '../utils/lottery';
import { useI18n } from '../data/i18n';
import { C } from '../theme';

export default function HomeScreen() {
  const { t, lang } = useI18n();
  const nav = useNavigation<any>();
  const [nd, setNd] = useState(nextDrawInfo());
  const [aboutVisible, setAboutVisible] = useState(false);

  useEffect(() => {
    const iv = setInterval(() => setNd(nextDrawInfo()), 60000);
    return () => clearInterval(iv);
  }, []);

  const latest = DRAWS[0];
  const total = DRAWS.length;
  const quotes = t('quotes') as string[];
  const quoteIdx = Math.floor(Date.now() / 86400000) % quotes.length;

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      {/* countdown */}
      <View style={s.card}>
        <Text style={s.cardTitle}>⏳ {t('nextDraw')}</Text>
        <View style={s.countRow}>
          <Text style={s.countNum}>{nd.days}</Text>
          <Text style={s.countUnit}>{t('days')}</Text>
          <Text style={s.countNum}>{nd.hours}</Text>
          <Text style={s.countUnit}>{t('hours')}</Text>
        </View>
        <Text style={s.muted}>{t('drawTime') as string}</Text>
      </View>

      {/* latest result */}
      {latest && (
        <View style={[s.card, s.center]}>
          <Text style={s.resultLabel}>{t('latestResult')} · {fmtDate(latest.date, lang)}</Text>
          <View style={s.digitsRow}>
            {[...latest.num].map((ch, i) => (
              <Text key={i} style={[s.digit, i >= latest.num.length - 5 && s.digitHl]}>{ch}</Text>
            ))}
          </View>
          <Text style={s.animalBadge}>🐾 {animalName(latest.num.slice(-2), lang)}</Text>
          <View style={s.tailsRow}>
            {[5, 4, 3, 2].map(n => (
              <View key={n} style={s.tail}>
                <Text style={s.tailLabel}>{n}</Text>
                <Text style={s.tailNum}>{latest.num.slice(-n)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* menu */}
      <View style={s.menu}>
        {[
          { icon: '🎫', tk: 'menuCheckT', dk: 'menuCheckD', screen: 'Check' },
          { icon: '🔮', tk: 'menuLuckyT', dk: 'menuLuckyD', screen: 'Lucky' },
          { icon: '⏰', tk: 'menuRiskT',  dk: 'menuRiskD',  screen: 'Risk' },
          { icon: '📊', tk: 'menuStatsT', dk: 'menuStatsD', screen: 'Stats' },
        ].map(item => (
          <TouchableOpacity key={item.screen} style={s.menuItem} onPress={() => nav.navigate(item.screen)}>
            <Text style={s.menuIcon}>{item.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.menuTitle}>{t(item.tk) as string}</Text>
              <Text style={s.menuDesc}>{t(item.dk) as string}</Text>
            </View>
            <Text style={s.muted}>›</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={s.menuItem} onPress={() => setAboutVisible(true)}>
          <Text style={s.menuIcon}>ℹ️</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.menuTitle}>{t('about') as string}</Text>
            <Text style={s.menuDesc}>Disclaimer · 18+</Text>
          </View>
          <Text style={s.muted}>›</Text>
        </TouchableOpacity>
      </View>

      {/* quote */}
      <View style={s.quoteBox}>
        <Text style={s.quoteTxt}>💬 {quotes[quoteIdx]}</Text>
      </View>
      <Text style={s.footer}>{total} {t('historyCount') as string} · {t('disclaimerShort') as string}</Text>

      {/* about modal */}
      <Modal visible={aboutVisible} animationType="slide" transparent onRequestClose={() => setAboutVisible(false)}>
        <View style={s.overlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>{t('aboutTitle') as string}</Text>
            <Text style={s.modalBody}>{t('disclaimerFull') as string}</Text>
            <Text style={s.modalNote}>{t('sourceNote') as string}</Text>
            <TouchableOpacity style={s.closeBtn} onPress={() => setAboutVisible(false)}>
              <Text style={s.closeBtnTxt}>{t('close') as string}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 14 },
  center: { alignItems: 'center' },
  cardTitle: { color: C.text, fontSize: 16, fontWeight: 'bold', marginBottom: 10 },
  muted: { color: C.muted, fontSize: 12 },
  countRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: 6 },
  countNum: { color: C.accent, fontSize: 42, fontWeight: 'bold' },
  countUnit: { color: C.muted, fontSize: 14, marginRight: 12 },
  resultLabel: { color: C.muted, fontSize: 13, marginBottom: 10 },
  digitsRow: { flexDirection: 'row', gap: 5, marginBottom: 8 },
  digit: { width: 38, height: 46, backgroundColor: C.input, borderRadius: 8,
    textAlign: 'center', lineHeight: 46, color: C.muted, fontSize: 20,
    fontFamily: 'Courier New' } as any,
  digitHl: { backgroundColor: C.accent + '33', color: C.accent, borderWidth: 1, borderColor: C.accent },
  animalBadge: { color: C.gold, fontWeight: 'bold', fontSize: 16, marginBottom: 10 },
  tailsRow: { flexDirection: 'row', gap: 16 },
  tail: { alignItems: 'center' },
  tailLabel: { color: C.muted, fontSize: 11 },
  tailNum: { color: C.text, fontFamily: 'Courier New', fontSize: 16, fontWeight: 'bold' },
  menu: { backgroundColor: C.card, borderRadius: 16, overflow: 'hidden', marginBottom: 14 },
  menuItem: { flexDirection: 'row', alignItems: 'center', padding: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  menuIcon: { fontSize: 22, width: 34 },
  menuTitle: { color: C.text, fontSize: 15, fontWeight: 'bold' },
  menuDesc: { color: C.muted, fontSize: 12, marginTop: 2 },
  quoteBox: { backgroundColor: C.card, borderRadius: 12, padding: 14, marginBottom: 12 },
  quoteTxt: { color: C.muted, fontSize: 13, lineHeight: 20, fontStyle: 'italic' },
  footer: { color: C.muted, fontSize: 11, textAlign: 'center', lineHeight: 16 },
  overlay: { flex: 1, backgroundColor: '#000c', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24 },
  modalTitle: { color: C.text, fontSize: 18, fontWeight: 'bold', marginBottom: 12 },
  modalBody: { color: C.text, fontSize: 14, lineHeight: 22, marginBottom: 12 },
  modalNote: { color: C.muted, fontSize: 12, marginBottom: 20 },
  closeBtn: { backgroundColor: C.accent, borderRadius: 10, padding: 14, alignItems: 'center' },
  closeBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
