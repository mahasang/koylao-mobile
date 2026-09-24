import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useI18n } from '../data/i18n';
import { fmtDate } from '../utils/lottery';
import type { NewWin } from '../data/purchases';
import { C } from '../theme';

export default function WinCelebrationModal({
  visible, wins, totalAmt, onClose,
}: { visible: boolean; wins: NewWin[]; totalAmt: number; onClose: () => void }) {
  const { t, lang } = useI18n();
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${p(now.getHours())}:${p(now.getMinutes())}:${p(now.getSeconds())}`;
  const drawDate = wins[0]?.drawDate;
  const jackpotCount = wins.filter(w => w.hit === 6).length;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={s.screen}>
        <LinearGradient colors={[C.gold, '#e8801f', '#c94f13']} style={s.hero}>
          <TouchableOpacity style={s.backBtn} onPress={onClose}>
            <Text style={s.backTxt}>‹</Text>
          </TouchableOpacity>

          <Text style={s.spark}>✦</Text>
          <Text style={[s.spark, s.spark2]}>✦</Text>
          <Text style={[s.spark, s.spark3]}>✧</Text>
          <Text style={[s.spark, s.spark4]}>✧</Text>

          <Image source={require('../../assets/icon.png')} style={s.avatar} />
          <Text style={s.congrats}>🎉 {t('winCongrats') as string} 🎉</Text>

          <View style={s.ribbon}>
            <Text style={s.ribbonTxt}>{t('winRibbon') as string}</Text>
          </View>

          <Text style={s.totalLabel}>{t('winTotalLabel') as string}</Text>
          <Text style={s.totalAmt}>{totalAmt.toLocaleString()} ₭</Text>
        </LinearGradient>

        <View style={s.sheet}>
          <View style={s.statusRow}>
            <View style={s.statusLeft}>
              <View style={s.checkCircle}><Text style={s.checkTxt}>✓</Text></View>
              <Text style={s.statusText}>{t('winChecked') as string}</Text>
            </View>
            <Text style={s.muted}>{timeStr}</Text>
          </View>

          {drawDate && (
            <View style={s.rowBetween}>
              <Text style={s.muted}>{t('drawRoundLabel') as string}</Text>
              <Text style={s.roundVal}>{fmtDate(drawDate, lang)}</Text>
            </View>
          )}
          {jackpotCount > 0 && (
            <View style={s.rowBetween}>
              <Text style={s.muted}>{t('winJackpotCount') as string}</Text>
              <Text style={s.jackpotVal}>🎁 {jackpotCount}</Text>
            </View>
          )}

          <View style={s.divider} />
          <Text style={s.numsTitle}>{t('winNumbersLabel') as string}</Text>

          <ScrollView style={s.grid} nestedScrollEnabled>
            <View style={s.gridWrap}>
              {wins.map((w, i) => (
                <View key={`${w.num}-${i}`} style={[s.numCard, w.hit === 6 && s.numCardJackpot]}>
                  <Text style={s.numCardIcon}>{w.hit === 6 ? '🎁' : '🔴'}</Text>
                  <Text style={s.numCardNum}>{w.num}</Text>
                  <Text style={s.numCardAmt}>+{w.pay.toLocaleString()} ₭</Text>
                </View>
              ))}
            </View>
          </ScrollView>

          <TouchableOpacity style={s.closeBtn} onPress={onClose}>
            <Text style={s.closeBtnTxt}>{t('close') as string}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  hero: { alignItems: 'center', paddingTop: 60, paddingBottom: 40, paddingHorizontal: 20 },
  backBtn: { position: 'absolute', top: 50, left: 16, width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#ffffff33', alignItems: 'center', justifyContent: 'center' },
  backTxt: { color: '#fff', fontSize: 26, fontWeight: 'bold', marginTop: -2 },
  spark: { position: 'absolute', color: '#ffffffaa', fontSize: 20 },
  spark2: { top: 90, right: 40, fontSize: 26 },
  spark3: { top: 160, left: 30, fontSize: 16 },
  spark4: { bottom: 90, right: 60, fontSize: 22 },
  avatar: { width: 76, height: 76, borderRadius: 38, borderWidth: 3, borderColor: '#fff', marginBottom: 12 },
  congrats: { color: '#fff', fontSize: 17, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  ribbon: { backgroundColor: '#fff', paddingHorizontal: 28, paddingVertical: 8, borderRadius: 20,
    marginBottom: 16, elevation: 3, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4 },
  ribbonTxt: { color: '#c94f13', fontWeight: 'bold', fontSize: 15 },
  totalLabel: { color: '#ffffffcc', fontSize: 13, marginBottom: 4 },
  totalAmt: { color: '#fff', fontSize: 36, fontWeight: 'bold' },
  sheet: { flex: 1, backgroundColor: C.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    marginTop: -20, padding: 20 },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  statusLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#2e9e4f',
    alignItems: 'center', justifyContent: 'center' },
  checkTxt: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
  statusText: { color: C.text, fontWeight: 'bold', fontSize: 14 },
  muted: { color: C.muted, fontSize: 12 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  roundVal: { color: C.text, fontWeight: 'bold', fontSize: 13 },
  jackpotVal: { color: C.gold, fontWeight: 'bold', fontSize: 13 },
  divider: { height: 1, backgroundColor: C.border, marginVertical: 12 },
  numsTitle: { color: C.text, fontWeight: 'bold', fontSize: 14, marginBottom: 10 },
  grid: { flex: 1 },
  gridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 10 },
  numCard: { width: '47%', backgroundColor: C.input, borderRadius: 12, padding: 12, alignItems: 'center' },
  numCardJackpot: { backgroundColor: C.gold + '22', borderWidth: 1, borderColor: C.gold },
  numCardIcon: { fontSize: 18, marginBottom: 4 },
  numCardNum: { color: C.text, fontFamily: 'Courier New', fontSize: 17, fontWeight: 'bold', letterSpacing: 1 },
  numCardAmt: { color: '#2e9e4f', fontWeight: 'bold', fontSize: 13, marginTop: 2 },
  closeBtn: { backgroundColor: C.accent, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 10 },
  closeBtnTxt: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
