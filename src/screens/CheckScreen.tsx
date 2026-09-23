import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Alert, Keyboard,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from '@react-navigation/native';
import { DRAWS, animalName, animalEmoji } from '../data/lottery';
import { checkNumber, prizeId, fmtDate } from '../utils/lottery';
import { useI18n } from '../data/i18n';
import { C } from '../theme';

const SAVED_KEY = 'koylao_saved_v1';

export default function CheckScreen() {
  const { t, lang } = useI18n();
  const [selDate, setSelDate] = useState(DRAWS[0]?.date ?? '');
  const [input, setInput] = useState('');
  const [result, setResult] = useState<{ num: string; res: ReturnType<typeof checkNumber> } | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [savedResults, setSavedResults] = useState<Record<string, ReturnType<typeof checkNumber>>>({});
  const [showPicker, setShowPicker] = useState(false);

  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(SAVED_KEY).then(v => {
      try { setSaved(v ? JSON.parse(v) : []); } catch { setSaved([]); }
    });
  }, []));

  const draw = DRAWS.find(d => d.date === selDate) ?? DRAWS[0];

  const persistSaved = async (arr: string[]) => {
    setSaved(arr);
    await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(arr));
  };

  const doCheck = () => {
    Keyboard.dismiss();
    const num = input.trim();
    if (!num) { Alert.alert('', t('noInput') as string); return; }
    if (!draw) return;
    setResult({ num, res: checkNumber(num, draw.num) });
  };

  const saveNum = async (num: string) => {
    if (saved.includes(num)) { Alert.alert('', t('dupSaved') as string); return; }
    await persistSaved([num, ...saved]);
    Alert.alert('', t('savedOk') as string);
  };

  const removeNum = async (num: string) => {
    await persistSaved(saved.filter(n => n !== num));
    setSavedResults(prev => { const p = { ...prev }; delete p[num]; return p; });
  };

  const checkAll = () => {
    if (!draw) return;
    const map: Record<string, ReturnType<typeof checkNumber>> = {};
    saved.forEach(n => { map[n] = checkNumber(n, draw.num); });
    setSavedResults(map);
  };

  const pid = result?.res.hit ? prizeId(result.res.hit) : null;

  return (
    <ScrollView style={s.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      <View style={s.card}>
        <Text style={s.cardTitle}>🎫 {t('checkTitle')}</Text>

        {/* draw selector */}
        <Text style={s.label}>{t('selectDraw')}</Text>
        <TouchableOpacity style={s.select} onPress={() => setShowPicker(v => !v)}>
          <Text style={s.selectTxt}>{draw ? `${fmtDate(draw.date, lang)} · ${draw.num}` : '—'}</Text>
          <Text style={s.muted}>{showPicker ? '▲' : '▼'}</Text>
        </TouchableOpacity>
        {showPicker && (
          <ScrollView style={s.picker} nestedScrollEnabled>
            {DRAWS.slice(0, 60).map(d => (
              <TouchableOpacity key={d.date}
                style={[s.pickerItem, d.date === selDate && s.pickerSel]}
                onPress={() => { setSelDate(d.date); setShowPicker(false); setResult(null); }}>
                <Text style={[s.pickerTxt, d.date === selDate && { color: C.accent }]}>
                  {fmtDate(d.date, lang)} · {d.num}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* input */}
        <Text style={s.label}>{t('inputLabel')}</Text>
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={v => setInput(v.replace(/\D/g, '').slice(0, 6))}
            keyboardType="numeric"
            placeholder={t('inputPh') as string}
            placeholderTextColor={C.muted}
            onSubmitEditing={doCheck}
            maxLength={6}
          />
          {input.length > 0 && (
            <TouchableOpacity style={s.clearBtn} onPress={() => { setInput(''); setResult(null); }}>
              <Text style={s.muted}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity style={s.primaryBtn} onPress={doCheck}>
          <Text style={s.primaryBtnTxt}>✓ {t('checkBtn')}</Text>
        </TouchableOpacity>
      </View>

      {/* verdict */}
      {result && (
        <View style={[s.verdict, result.res.hit ? s.verdictWin : s.verdictLose]}>
          <Text style={s.muted}>{draw ? `${fmtDate(draw.date, lang)} · ${draw.num}` : ''}</Text>
          <Text style={s.verdictEmoji}>{result.res.hit ? '🎉' : '🥲'}</Text>
          <Text style={s.verdictTitle}>{t(result.res.hit ? 'winTitle' : 'loseTitle') as string}</Text>
          {result.res.nearMiss && <Text style={s.nearMiss}>{t('nearMiss') as string}</Text>}
          {pid && (
            <View style={s.prizeRow}>
              <Text style={s.prizeLabel}>🏅 {t('p_' + pid) as string}</Text>
              <Text style={s.prizeAmt}>{t('pay_' + pid) as string}</Text>
            </View>
          )}
          {pid && <Text style={[s.muted, { fontSize: 11, marginBottom: 8 }]}>{t('payoutNote') as string}</Text>}
          <TouchableOpacity style={s.saveBtn} onPress={() => saveNum(result.num)}>
            <Text style={s.saveBtnTxt}>💾 {t('saveBtn')}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* digit breakdown */}
      {draw && (
        <View style={[s.card, { alignItems: 'center' }]}>
          <View style={s.digitsRow}>
            {[...draw.num].map((ch, i) => (
              <Text key={i} style={[s.digit, s.digitHl]}>{ch}</Text>
            ))}
          </View>
          <Text style={s.animalBadge}>{animalEmoji(draw.num.slice(-2))} {animalName(draw.num.slice(-2), lang)}</Text>
          <View style={s.tailsRow}>
            {[5, 4, 3, 2].map(n => (
              <View key={n} style={s.tail}>
                <Text style={s.tailLabel}>{n}</Text>
                <Text style={s.tailNum}>{draw.num.slice(-n)}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* saved numbers */}
      <View style={s.card}>
        <View style={s.rowBetween}>
          <Text style={s.cardTitle}>📌 {t('savedTitle')} <Text style={{ color: C.accent }}>{saved.length}</Text></Text>
          {saved.length > 0 && (
            <TouchableOpacity onPress={checkAll}>
              <Text style={s.link}>{t('checkAll')}</Text>
            </TouchableOpacity>
          )}
        </View>
        {saved.length === 0
          ? <Text style={s.empty}>{t('emptySaved') as string}</Text>
          : saved.map(n => {
              const r = savedResults[n];
              const has = n in savedResults;
              return (
                <View key={n} style={s.savedItem}>
                  <Text style={s.savedNum}>{n}</Text>
                  {has && (
                    <Text style={[s.savedRes, r?.hit ? s.winTxt : s.loseTxt]}>
                      {r?.hit ? `✓ ${t('savedWin')}` : `✕ ${t('savedLose')}`}
                    </Text>
                  )}
                  <TouchableOpacity onPress={() => removeNum(n)}>
                    <Text style={{ fontSize: 18 }}>🗑</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
      </View>

      <Text style={s.disc}>{t('disclaimerShort') as string}</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 14 },
  cardTitle: { color: C.text, fontSize: 17, fontWeight: 'bold', marginBottom: 12 },
  label: { color: C.muted, fontSize: 13, marginBottom: 6 },
  muted: { color: C.muted, fontSize: 12 },
  select: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.input,
    borderRadius: 10, padding: 12, marginBottom: 12, justifyContent: 'space-between' },
  selectTxt: { color: C.text, fontSize: 15, flex: 1 },
  picker: { backgroundColor: C.input, borderRadius: 10, maxHeight: 220, marginBottom: 12 },
  pickerItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  pickerSel: { backgroundColor: C.accent + '22' },
  pickerTxt: { color: C.muted, fontSize: 14 },
  inputRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  input: { flex: 1, backgroundColor: C.input, borderRadius: 10, padding: 12,
    color: C.text, fontFamily: 'Courier New', fontSize: 22, letterSpacing: 4 },
  clearBtn: { padding: 10, marginLeft: 8 },
  primaryBtn: { backgroundColor: C.accent, borderRadius: 10, padding: 14, alignItems: 'center' },
  primaryBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  verdict: { borderRadius: 16, padding: 16, marginBottom: 14, alignItems: 'center' },
  verdictWin: { backgroundColor: '#E6F7E9', borderWidth: 1, borderColor: '#4caf50' },
  verdictLose: { backgroundColor: '#FCEAEA', borderWidth: 1, borderColor: '#e57373' },
  verdictEmoji: { fontSize: 40, marginVertical: 4 },
  verdictTitle: { color: C.text, fontSize: 18, fontWeight: 'bold', marginBottom: 8 },
  nearMiss: { color: '#f0c040', fontSize: 13, marginBottom: 8 },
  prizeRow: { flexDirection: 'row', justifyContent: 'space-between', width: '100%',
    backgroundColor: C.input, borderRadius: 10, padding: 12, marginBottom: 4 },
  prizeLabel: { color: C.text, fontWeight: 'bold', fontSize: 14 },
  prizeAmt: { color: C.gold, fontWeight: 'bold', fontSize: 14 },
  saveBtn: { backgroundColor: C.violet + '33', borderWidth: 1, borderColor: C.violet,
    borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, marginTop: 8 },
  saveBtnTxt: { color: C.violet, fontWeight: 'bold', fontSize: 14 },
  digitsRow: { flexDirection: 'row', gap: 5, marginBottom: 8 },
  digit: { width: 38, height: 46, backgroundColor: C.input, borderRadius: 8,
    textAlign: 'center', lineHeight: 46, color: C.muted,
    fontFamily: 'Courier New', fontSize: 20 } as any,
  digitHl: { backgroundColor: C.accent + '33', color: C.accent, borderWidth: 1, borderColor: C.accent },
  animalBadge: { color: C.gold, fontWeight: 'bold', fontSize: 15, marginBottom: 10 },
  tailsRow: { flexDirection: 'row', gap: 16 },
  tail: { alignItems: 'center' },
  tailLabel: { color: C.muted, fontSize: 11 },
  tailNum: { color: C.text, fontFamily: 'Courier New', fontSize: 17, fontWeight: 'bold' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  link: { color: C.accent, fontWeight: 'bold', fontSize: 14 },
  empty: { color: C.muted, fontSize: 13, textAlign: 'center', paddingVertical: 8 },
  savedItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: C.border },
  savedNum: { flex: 1, color: C.text, fontFamily: 'Courier New', fontSize: 18, letterSpacing: 2 },
  savedRes: { fontWeight: 'bold', fontSize: 13, marginRight: 8 },
  winTxt: { color: '#4caf50' },
  loseTxt: { color: '#e57373' },
  disc: { color: C.muted, fontSize: 11, textAlign: 'center' },
});
