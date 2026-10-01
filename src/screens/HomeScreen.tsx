import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Modal, Platform,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { getDraws, fetchLatestDraws, animalName, animalEmoji } from '../data/lottery';
import type { Draw } from '../data/lottery';
import { fmtDate } from '../utils/lottery';
import { fetchRounds, isRoundOpen, msUntilClose, fmtCloseTime, nextSaleDate } from '../data/rounds';
import type { Round } from '../data/rounds';
import { useI18n } from '../data/i18n';
import { useAuth } from '../data/auth';
import ResultMeta from '../components/ResultMeta';
import { C } from '../theme';

export default function HomeScreen() {
  const { t, lang } = useI18n();
  const nav = useNavigation<any>();
  const { session, stats } = useAuth();
  const [rounds, setRounds] = useState<Round[] | null>(null);
  const [roundsFailed, setRoundsFailed] = useState(false);
  const [, setTick] = useState(0);
  const [aboutVisible, setAboutVisible] = useState(false);
  const [draws, setDraws] = useState<Draw[]>(getDraws());

  useEffect(() => {
    const iv = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(iv);
  }, []);

  const loadRounds = useCallback(() => {
    fetchRounds().then(r => { setRoundsFailed(false); setRounds(r); }).catch(() => setRoundsFailed(true));
  }, []);

  useEffect(() => {
    fetchLatestDraws().then(() => setDraws(getDraws())).catch(() => {});
  }, []);

  useFocusEffect(useCallback(() => { setDraws(getDraws()); loadRounds(); }, [loadRounds]));

  const latest = draws[0];
  // Countdown runs to the SERVER's closing time of the next open draw.
  const next = rounds?.find(isRoundOpen) ?? null;
  const ms = next ? msUntilClose(next) : 0;
  const nd = {
    days: Math.floor(ms / 86400000), hours: Math.floor((ms % 86400000) / 3600000),
    minutes: Math.floor((ms % 3600000) / 60000), seconds: Math.floor((ms % 60000) / 1000),
  };
  const goRisk = (screen: string) => nav.navigate('Risk', { screen });
  const total = draws.length;
  const quotes = t('quotes') as string[];
  const quoteIdx = Math.floor(Date.now() / 86400000) % quotes.length;

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      {/* the draw that is open for sale, with its exact closing time */}
      <View style={s.card}>
        <Text style={s.cardTitle}>🎟️ {t('homeOpenRound')}</Text>
        {next ? (
          <>
            <Text style={s.roundDate}>{fmtDate(next.drawDate, lang, { weekday: 'long', day: 'numeric', month: 'long' })}</Text>
            <Text style={s.closeLine}>⏰ {(t('roundCloses') as string).replace('{time}', fmtCloseTime(next.closesAt))}</Text>
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
            <TouchableOpacity style={s.buyBtn} onPress={() => goRisk('RiskBuy')}>
              <Text style={s.buyBtnTxt}>🎯 {t('homeBuyNow') as string}</Text>
            </TouchableOpacity>
            {!session && <Text style={[s.muted, { textAlign: 'center', marginTop: 6 }]}>🔒 {t('homeLoginHint') as string}</Text>}
          </>
        ) : roundsFailed ? (
          <TouchableOpacity onPress={loadRounds}>
            <Text style={s.muted}>⚠️ {t('roundsLoadFail') as string} — {t('retryBtn') as string}</Text>
          </TouchableOpacity>
        ) : (
          <>
            <Text style={s.muted}>{rounds ? t('homeNoRound') as string : '…'}</Text>
            {rounds && (
              <Text style={[s.muted, { marginTop: 4 }]}>
                {(t('nextRoundOpens') as string).replace('{date}', fmtDate(nextSaleDate(), lang, { weekday: 'long', day: 'numeric', month: 'long' }))}
              </Text>
            )}
          </>
        )}
      </View>

      {/* latest result */}
      {latest && (
        <View style={[s.card, s.center]}>
          <Text style={s.resultLabel}>{t('latestResult')} · {fmtDate(latest.date, lang)}</Text>
          <View style={s.digitsRow}>
            {[...latest.num].map((ch, i) => (
              <Text key={i} style={[s.digit, s.digitHl]}>{ch}</Text>
            ))}
          </View>
          <View style={s.animalRow}>
            <Text style={s.animalEmoji}>{animalEmoji(latest.num.slice(-2))}</Text>
            <Text style={s.animalBadge}>{animalName(latest.num.slice(-2), lang)}</Text>
          </View>
          <View style={s.tailsRow}>
            {[5, 4, 3, 2].map(n => (
              <View key={n} style={s.tail}>
                <Text style={s.tailLabel}>{n}</Text>
                <Text style={s.tailNum}>{latest.num.slice(-n)}</Text>
              </View>
            ))}
          </View>
          <ResultMeta draw={latest} />
        </View>
      )}

      {/* shortcuts */}
      <View style={s.tiles}>
        {[
          { icon: '👛', label: t('homeWalletTile') as string, sub: session ? `${(stats?.balance ?? 0).toLocaleString()} ₭` : undefined, screen: 'Wallet' },
          { icon: '📜', label: t('homeTicketsTile') as string, screen: 'RiskHistory' },
          { icon: '🛟', label: t('homeHelpTile') as string, root: 'Help' },
        ].map(x => (
          <TouchableOpacity key={x.label} style={s.tile}
            onPress={() => (x.root ? nav.navigate(x.root) : goRisk(x.screen!))}>
            <Text style={s.tileIcon}>{x.icon}</Text>
            <Text style={s.tileTxt} numberOfLines={1}>{x.label}</Text>
            {x.sub ? <Text style={s.tileSub} numberOfLines={1}>{x.sub}</Text> : null}
          </TouchableOpacity>
        ))}
      </View>

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
  roundDate: { color: C.text, fontSize: 15, fontWeight: 'bold' },
  closeLine: { color: C.accent, fontSize: 13, fontWeight: 'bold', marginTop: 2, marginBottom: 10 },
  buyBtn: { backgroundColor: C.accent, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 6 },
  buyBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  tiles: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  tile: { flex: 1, backgroundColor: C.card, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center' },
  tileIcon: { fontSize: 22, marginBottom: 4 },
  tileTxt: { color: C.text, fontSize: 11, fontWeight: 'bold', textAlign: 'center' },
  tileSub: { color: C.accent, fontSize: 10, fontWeight: 'bold', marginTop: 2 },
  countRow: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 3, marginBottom: 6 },
  countNum: { color: C.accent, fontSize: 26, fontWeight: 'bold' },
  countUnit: { color: C.muted, fontSize: 12, marginRight: 10 },
  resultLabel: { color: C.muted, fontSize: 13, marginBottom: 10 },
  digitsRow: { flexDirection: 'row', gap: 5, marginBottom: 8 },
  digit: { width: 38, height: 46, backgroundColor: C.input, borderRadius: 8,
    textAlign: 'center', lineHeight: 46, color: C.muted, fontSize: 20,
    fontFamily: 'Courier New' } as any,
  digitHl: { backgroundColor: C.accent + '33', color: C.accent, borderWidth: 1, borderColor: C.accent },
  animalRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  animalEmoji: { fontSize: 34 },
  animalBadge: { color: C.gold, fontWeight: 'bold', fontSize: 16 },
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
