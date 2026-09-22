import React, { useState, useRef } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, Animated, Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { animalName } from '../data/lottery';
import { last2Stats, fmtDate } from '../utils/lottery';
import { DRAWS } from '../data/lottery';
import { useI18n } from '../data/i18n';
import { C } from '../theme';

const SAVED_KEY = 'koylao_saved_v1';
const DIGIT_TYPES = [2, 3, 4, 5, 6];

export default function LuckyScreen() {
  const { t, lang } = useI18n();
  const [digitType, setDigitType] = useState(5);
  const [rolling, setRolling] = useState(false);
  const [rolledNum, setRolledNum] = useState('');
  const [fortune, setFortune] = useState('');
  const [displayNum, setDisplayNum] = useState('');
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const { stat, total } = last2Stats(DRAWS);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8,  duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 4,  duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,  duration: 50, useNativeDriver: true }),
    ]).start();
  };

  const rollLucky = () => {
    if (rolling) return;
    setRolling(true);
    setRolledNum('');
    setFortune('');
    const n = digitType;
    const pick = () => String(Math.floor(Math.random() * Math.pow(10, n))).padStart(n, '0');
    let ticks = 0;
    const iv = setInterval(() => {
      setDisplayNum(pick());
      shake();
      if (++ticks > 22) {
        clearInterval(iv);
        const final = pick();
        const fortunes = t('fortunes') as string[];
        setRolledNum(final);
        setDisplayNum(final);
        setFortune(fortunes[Math.floor(Math.random() * fortunes.length)]);
        setRolling(false);
      }
    }, 70);
  };

  const saveNum = async () => {
    if (!rolledNum) return;
    try {
      const v = await AsyncStorage.getItem(SAVED_KEY);
      const arr: string[] = v ? JSON.parse(v) : [];
      if (arr.includes(rolledNum)) { Alert.alert('', t('dupSaved') as string); return; }
      arr.unshift(rolledNum);
      await AsyncStorage.setItem(SAVED_KEY, JSON.stringify(arr));
      Alert.alert('', t('savedOk') as string);
    } catch {}
  };

  const l2 = rolledNum.slice(-2);
  const s2 = rolledNum ? stat[l2] : null;

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      <View style={s.card}>
        <Text style={s.cardTitle}>🔮 {t('luckyTitle')}</Text>

        <Text style={s.label}>{t('chooseType')}</Text>
        <View style={s.chipRow}>
          {DIGIT_TYPES.map(n => (
            <TouchableOpacity key={n}
              style={[s.chip, digitType === n && s.chipOn]}
              onPress={() => { setDigitType(n); setRolledNum(''); setFortune(''); }}>
              <Text style={[s.chipTxt, digitType === n && s.chipOnTxt]}>{n}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={s.stage}>
          <Animated.Text style={[s.rolledNum, { transform: [{ translateX: shakeAnim }] }]}>
            {rolling ? displayNum : (rolledNum || '— —')}
          </Animated.Text>

          {rolledNum && !rolling && (
            <>
              <Text style={s.animalBadge}>
                🐾 {animalName(l2, lang)}
                <Text style={s.muted}> · {t('yourAnimal')}</Text>
              </Text>

              {s2 && (
                <View style={s.statRow}>
                  <View style={s.statBox}>
                    <Text style={s.statVal}>{s2.count}×</Text>
                    <Text style={s.muted}>
                      {(t('statAppeared') as string).replace('{n}', String(s2.count)).replace('{t}', String(total))}
                    </Text>
                  </View>
                  <View style={s.statBox}>
                    <Text style={s.statVal}>
                      {s2.lastIdx !== null
                        ? fmtDate(s2.lastDate ?? '', lang, { day: 'numeric', month: 'short' })
                        : '🤷'}
                    </Text>
                    <Text style={s.muted}>{s2.lastIdx !== null ? t('statLast') : t('statNever')}</Text>
                  </View>
                </View>
              )}

              <View style={s.fortuneBox}>
                <Text style={s.fortuneTitle}>🥃 {t('fortuneTitle')}:</Text>
                <Text style={s.fortuneTxt}>{fortune}</Text>
              </View>

              <TouchableOpacity style={s.saveBtn} onPress={saveNum}>
                <Text style={s.saveBtnTxt}>💾 {t('saveBtn')}</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={[s.rollBtn, rolling && s.rollBtnOff]} onPress={rollLucky} disabled={rolling}>
            <Text style={s.rollBtnTxt}>{rolling ? `⏳ ${t('rolling')}` : `🎲 ${t('rollBtn')}`}</Text>
          </TouchableOpacity>
        </View>
      </View>
      <Text style={s.disc}>⚠️ {t('disclaimerShort') as string}</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  card: { backgroundColor: C.card, borderRadius: 16, padding: 16, marginBottom: 14 },
  cardTitle: { color: C.text, fontSize: 17, fontWeight: 'bold', marginBottom: 12 },
  label: { color: C.muted, fontSize: 13, marginBottom: 8 },
  muted: { color: C.muted, fontSize: 12 },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 20,
    backgroundColor: C.input, borderWidth: 1, borderColor: C.border },
  chipOn: { backgroundColor: C.accent, borderColor: C.accent },
  chipTxt: { color: C.muted, fontWeight: 'bold', fontSize: 15 },
  chipOnTxt: { color: '#fff' },
  stage: { alignItems: 'center', paddingVertical: 8 },
  rolledNum: { fontSize: 52, fontFamily: 'Courier New', color: C.accent,
    letterSpacing: 6, marginBottom: 12, minHeight: 70, textAlign: 'center' },
  animalBadge: { color: C.gold, fontWeight: 'bold', fontSize: 16, marginBottom: 12 },
  statRow: { flexDirection: 'row', gap: 12, marginBottom: 12, justifyContent: 'center' },
  statBox: { alignItems: 'center', backgroundColor: C.input, borderRadius: 10, padding: 10, minWidth: 110 },
  statVal: { color: C.text, fontWeight: 'bold', fontSize: 16 },
  fortuneBox: { backgroundColor: C.input, borderRadius: 12, padding: 14, marginBottom: 12, width: '100%' },
  fortuneTitle: { color: C.muted, fontWeight: 'bold', fontSize: 13, marginBottom: 4 },
  fortuneTxt: { color: C.text, fontSize: 14, lineHeight: 20 },
  saveBtn: { backgroundColor: C.violet + '33', borderWidth: 1, borderColor: C.violet,
    borderRadius: 10, paddingHorizontal: 24, paddingVertical: 10, marginBottom: 16 },
  saveBtnTxt: { color: C.violet, fontWeight: 'bold', fontSize: 14 },
  rollBtn: { backgroundColor: C.accent, borderRadius: 12, paddingHorizontal: 40,
    paddingVertical: 14, width: '100%', alignItems: 'center' },
  rollBtnOff: { opacity: 0.5 },
  rollBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 17 },
  disc: { color: C.muted, fontSize: 11, textAlign: 'center' },
});
