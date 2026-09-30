import React, { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { FAQ } from '../data/faq';
import { useI18n } from '../data/i18n';
import { C } from '../theme';

export default function HelpScreen() {
  const { t, lang } = useI18n();
  const nav = useNavigation<any>();
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const go = (screen: string) => nav.navigate('Tabs', { screen: 'Risk', params: { screen } });

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      <View style={s.tiles}>
        {[
          { icon: '👛', label: t('menuWalletT') as string, screen: 'Wallet' },
          { icon: '📜', label: t('purchaseHistory') as string, screen: 'RiskHistory' },
          { icon: '🔍', label: t('menuVerifyT') as string, screen: 'VerifyTicket' },
        ].map(x => (
          <TouchableOpacity key={x.screen} style={s.tile} onPress={() => go(x.screen)}>
            <Text style={s.tileIcon}>{x.icon}</Text>
            <Text style={s.tileTxt}>{x.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={s.card}>
        {FAQ[lang].map((item, i) => {
          const open = openIdx === i;
          return (
            <View key={i} style={[s.item, i > 0 && s.itemBorder]}>
              <TouchableOpacity style={s.qRow} onPress={() => setOpenIdx(open ? null : i)}>
                <Text style={s.q}>{item.q}</Text>
                <Text style={s.chev}>{open ? '−' : '+'}</Text>
              </TouchableOpacity>
              {open && <Text style={s.a}>{item.a}</Text>}
            </View>
          );
        })}
      </View>
      <Text style={s.foot}>{t('disclaimerShort') as string}</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  tiles: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  tile: { flex: 1, backgroundColor: C.card, borderRadius: 14, padding: 12, alignItems: 'center' },
  tileIcon: { fontSize: 24, marginBottom: 4 },
  tileTxt: { color: C.text, fontSize: 12, fontWeight: 'bold', textAlign: 'center' },
  card: { backgroundColor: C.card, borderRadius: 16, paddingHorizontal: 16, marginBottom: 14 },
  item: { paddingVertical: 14 },
  itemBorder: { borderTopWidth: 1, borderTopColor: C.border },
  qRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  q: { flex: 1, color: C.text, fontWeight: 'bold', fontSize: 14, lineHeight: 20 },
  chev: { color: C.accent, fontSize: 22, fontWeight: 'bold', width: 20, textAlign: 'center' },
  a: { color: C.muted, fontSize: 13, lineHeight: 21, marginTop: 10 },
  foot: { color: C.muted, fontSize: 11, textAlign: 'center', lineHeight: 16 },
});
