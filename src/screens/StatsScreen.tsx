import React, { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { DRAWS, animalName, animalEmoji, getDraws, saveExtra, resetExtra } from '../data/lottery';
import type { Draw } from '../data/lottery';
import { last2Stats, fmtDate } from '../utils/lottery';
import { useI18n } from '../data/i18n';
import { C } from '../theme';

const API_URL = 'https://laodl.com/api/website/laolot/WinPrizeHistory?type=1';

export default function StatsScreen() {
  const { t, lang } = useI18n();
  const { width } = useWindowDimensions();
  const [histShown, setHistShown] = useState(25);
  const [draws, setDraws] = useState<Draw[]>(getDraws());
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState('');

  useFocusEffect(useCallback(() => { setDraws(getDraws()); }, []));

  const { stat, total } = last2Stats(draws);
  const barW = width - 32 - 32 - 80;

  const hot = Object.entries(stat).sort((a, b) => b[1].count - a[1].count).slice(0, 8);
  const maxHot = hot[0]?.[1].count || 1;

  const cold = Object.entries(stat)
    .filter(([, s]) => s.lastIdx === null || s.lastIdx > 20)
    .sort((a, b) => (b[1].lastIdx ?? 9999) - (a[1].lastIdx ?? 9999))
    .slice(0, 8);

  const digitCount = Array(10).fill(0);
  draws.forEach(d => { digitCount[+d.num.slice(-1)]++; });
  const maxDig = Math.max(...digitCount, 1);

  const BarRow = ({ label, count, maxV, blue }: { label: string; count: number; maxV: number; blue?: boolean }) => (
    <View style={s.barWrap}>
      <Text style={s.barLabel} numberOfLines={1}>{label}</Text>
      <View style={s.barTrack}>
        <View style={[s.barFill, {
          width: maxV ? Math.max(2, (count / maxV) * barW) : 2,
          backgroundColor: blue ? '#5f8bff' : C.accent,
        }]} />
      </View>
      <Text style={s.barCount}>{count}</Text>
    </View>
  );

  const doUpdate = async () => {
    setUpdating(true); setUpdateMsg('');
    try {
      const res = await fetch(API_URL, { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      const rows: any[] = (j && j.resultData) || [];
      const current = getDraws();
      const byDate: Record<string, Draw> = {};
      current.forEach(d => { byDate[d.date] = d; });
      let added = 0;
      for (const r of rows) {
        if (!r.winNumber || !r.roundDate) continue;
        const date = r.roundDate.slice(0, 10);
        if (!byDate[date]) { byDate[date] = { date, num: String(r.winNumber) }; added++; }
        else if (byDate[date].num !== String(r.winNumber)) byDate[date].num = String(r.winNumber);
      }
      const next = Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date));
      saveExtra(next); setDraws(next);
      setUpdateMsg(added
        ? (t('updated') as string).replace('{n}', String(added))
        : t('updatedNone') as string);
    } catch {
      setUpdateMsg(t('updateFail') as string);
    }
    setUpdating(false);
  };

  const doReset = () => { resetExtra(); setDraws(getDraws()); setUpdateMsg(t('resetDone') as string); };

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>

      {/* hot */}
      <View style={s.card}>
        <Text style={s.cardTitle}>🔥 {t('hotTitle')}</Text>
        {hot.map(([k2, st]) => (
          <BarRow key={k2} label={`${k2} ${animalEmoji(k2)} ${animalName(k2, lang) ?? ''}`} count={st.count} maxV={maxHot} />
        ))}
      </View>

      {/* cold */}
      <View style={s.card}>
        <Text style={s.cardTitle}>❄️ {t('coldTitle')}</Text>
        {cold.map(([k2, st]) => (
          <BarRow key={k2} label={k2} count={st.lastIdx ?? total} maxV={total} blue />
        ))}
        <Text style={s.note}>{t('coldNote') as string}</Text>
      </View>

      {/* last digit */}
      <View style={s.card}>
        <Text style={s.cardTitle}>🔢 {t('lastDigitTitle')}</Text>
        {digitCount.map((c, d) => <BarRow key={d} label={String(d)} count={c} maxV={maxDig} />)}
      </View>

      {/* history */}
      <View style={s.card}>
        <Text style={s.cardTitle}>📜 {t('historyTitle')} <Text style={{ color: C.accent }}>{total}</Text></Text>
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

      {/* data / update */}
      <View style={s.card}>
        <Text style={s.cardTitle}>🛰️ {t('dataTitle')}</Text>
        <Text style={s.note}>{t('lastUpdate')} {draws[0] ? fmtDate(draws[0].date, lang) : '—'} · {total} {t('historyCount')}</Text>
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
  note: { color: C.muted, fontSize: 12, marginTop: 4 },
  barWrap: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  barLabel: { color: C.muted, fontSize: 12, width: 72, marginRight: 4 },
  barTrack: { flex: 1, height: 18, backgroundColor: C.input, borderRadius: 6, overflow: 'hidden', marginRight: 6 },
  barFill: { height: '100%', borderRadius: 6 },
  barCount: { color: C.text, fontSize: 13, fontWeight: 'bold', width: 28, textAlign: 'right' },
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
