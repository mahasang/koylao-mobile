import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { animalName, animalEmoji, getDraws, fetchLatestDraws, resetExtra } from '../data/lottery';
import type { Draw } from '../data/lottery';
import { fmtDate } from '../utils/lottery';
import { useI18n } from '../data/i18n';
import { C } from '../theme';

export default function RiskResultsScreen() {
  const { t, lang } = useI18n();
  const [histShown, setHistShown] = useState(25);
  const [draws, setDraws] = useState<Draw[]>(getDraws());
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState('');

  useFocusEffect(useCallback(() => { setDraws(getDraws()); }, []));

  const doUpdate = async () => {
    setUpdating(true); setUpdateMsg('');
    try {
      const added = await fetchLatestDraws();
      setDraws(getDraws());
      setUpdateMsg(added
        ? (t('updated') as string).replace('{n}', String(added))
        : t('updatedNone') as string);
    } catch {
      setUpdateMsg(t('updateFail') as string);
    }
    setUpdating(false);
  };

  const doReset = async () => { await resetExtra(); setDraws(getDraws()); setUpdateMsg(t('resetDone') as string); };

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      {/* latest result — big & prominent */}
      {draws[0] && (
        <View style={[s.card, s.latestCard]}>
          <Text style={s.latestLabel}>🏆 {t('latestResult')} · {fmtDate(draws[0].date, lang)}</Text>
          <View style={s.latestDigitsRow}>
            {[...draws[0].num].map((ch, i) => (
              <Text key={i} style={s.latestDigit}>{ch}</Text>
            ))}
          </View>
          <View style={s.animalRow}>
            <Text style={s.animalEmoji}>{animalEmoji(draws[0].num.slice(-2))}</Text>
            <Text style={s.animalBadge}>{animalName(draws[0].num.slice(-2), lang)}</Text>
          </View>
        </View>
      )}

      <View style={s.card}>
        <Text style={s.cardTitle}>📅 {t('resultsHistoryTitle')} <Text style={{ color: C.accent }}>{draws.length}</Text></Text>
        <View style={[s.tableRow, s.tableHead]}>
          <Text style={[s.thDate, s.th]}>{t('thDate')}</Text>
          <Text style={[s.thNum, s.th]}>{t('thNumber')}</Text>
          <Text style={[s.thAnimal, s.th]}>{t('thAnimal')}</Text>
        </View>
        {draws.slice(0, histShown).map((d, i) => (
          <View key={d.date} style={[s.tableRow, i === 0 && s.tableRowHot]}>
            <Text style={[s.thDate, s.td]}>{fmtDate(d.date, lang, { day: 'numeric', month: 'short', year: '2-digit' })}</Text>
            <Text style={[s.thNum, s.tdMono]}>{d.num}</Text>
            <Text style={[s.thAnimal, s.td]}>{animalName(d.num.slice(-2), lang) ? `${animalEmoji(d.num.slice(-2))} ${animalName(d.num.slice(-2), lang)}` : '—'}</Text>
          </View>
        ))}
        {histShown < draws.length && (
          <TouchableOpacity style={s.moreBtn} onPress={() => setHistShown(h => h + 25)}>
            <Text style={s.moreBtnTxt}>{t('showMore')} (+25)</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={s.card}>
        <Text style={s.cardTitle}>🛰️ {t('dataTitle')}</Text>
        <Text style={s.note}>{t('lastUpdate')} {draws[0] ? fmtDate(draws[0].date, lang) : '—'} · {draws.length} {t('historyCount')}</Text>
        <View style={s.btnRow}>
          <TouchableOpacity style={[s.btn, s.btnPrimary]} onPress={doUpdate} disabled={updating}>
            {updating
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.btnTxt}>🔄 {t('updateBtn')}</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={[s.btn, s.btnDanger]} onPress={doReset}>
            <Text style={s.btnTxt}>🧹 {t('resetBtn')}</Text>
          </TouchableOpacity>
        </View>
        {updateMsg ? <Text style={s.updateMsg}>{updateMsg}</Text> : null}
        <Text style={[s.note, { marginTop: 8 }]}>{t('sourceNote') as string}</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 14 },
  cardTitle: { color: C.text, fontSize: 17, fontWeight: 'bold', marginBottom: 12 },
  latestCard: { alignItems: 'center' },
  latestLabel: { color: C.muted, fontSize: 13, fontWeight: 'bold', marginBottom: 12 },
  latestDigitsRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  latestDigit: { width: 48, height: 60, backgroundColor: C.accent + '33', borderWidth: 1.5, borderColor: C.accent,
    borderRadius: 10, textAlign: 'center', lineHeight: 60, color: C.accent, fontSize: 28,
    fontWeight: 'bold', fontFamily: 'Courier New' } as any,
  animalRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  animalEmoji: { fontSize: 34 },
  animalBadge: { color: C.gold, fontWeight: 'bold', fontSize: 16 },
  note: { color: C.muted, fontSize: 12, marginTop: 4 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border, paddingVertical: 7 },
  tableHead: { borderBottomWidth: 2 },
  tableRowHot: { backgroundColor: C.accent + '18', borderRadius: 6 },
  th: { color: C.muted, fontSize: 11, fontWeight: 'bold' },
  td: { color: C.text, fontSize: 13 },
  tdMono: { color: C.text, fontSize: 13, fontFamily: 'Courier New' },
  thDate: { flex: 2.2 }, thNum: { flex: 2 }, thAnimal: { flex: 2.5 },
  moreBtn: { backgroundColor: C.input, borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 8 },
  moreBtnTxt: { color: C.muted, fontWeight: 'bold', fontSize: 14 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 10, flexWrap: 'wrap' },
  btn: { borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11 },
  btnPrimary: { backgroundColor: C.accent },
  btnDanger: { backgroundColor: '#7c2020' },
  btnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  updateMsg: { color: C.gold, fontSize: 13, marginTop: 10 },
});
