import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useI18n, LANGS, type Lang } from '../data/i18n';
import { useAuth } from '../data/auth';
import AccountModal from './AccountModal';
import { C } from '../theme';

const LANG_LABELS: Record<Lang, string> = { lo: 'ລາວ', th: 'ไทย', en: 'EN' };

export default function AppHeader() {
  const { t, lang, setLang } = useI18n();
  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const [langOpen, setLangOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <View style={[s.header, { paddingTop: insets.top + 10 }]}>
      <View style={s.left}>
        <Image source={require('../../assets/icon.png')} style={s.logo} />
        <Text style={s.brand} numberOfLines={1}>{t('brand') as string}</Text>
      </View>

      <View style={s.right}>
        <TouchableOpacity style={s.langBtn} onPress={() => setLangOpen(true)}>
          <Text style={s.langTxt}>{LANG_LABELS[lang]}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.profileBtn, session && s.profileBtnOn]} onPress={() => setProfileOpen(true)}>
          <Text style={s.profileIcon}>👤</Text>
        </TouchableOpacity>
      </View>

      {/* language picker */}
      <Modal visible={langOpen} animationType="fade" transparent onRequestClose={() => setLangOpen(false)}>
        <TouchableOpacity style={s.langOverlay} activeOpacity={1} onPress={() => setLangOpen(false)}>
          <View style={[s.langSheet, { top: insets.top + 62 }]}>
            {LANGS.map(l => (
              <TouchableOpacity
                key={l}
                style={[s.langOption, lang === l && s.langOptionOn]}
                onPress={() => { setLang(l); setLangOpen(false); }}
              >
                <Text style={[s.langOptionTxt, lang === l && s.langOptionTxtOn]}>{LANG_LABELS[l]}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <AccountModal visible={profileOpen} onClose={() => setProfileOpen(false)} />
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingBottom: 12,
    backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  left: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 },
  logo: { width: 32, height: 32, borderRadius: 8 },
  brand: { color: C.text, fontSize: 17, fontWeight: 'bold', flexShrink: 1 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  langBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: C.input, borderWidth: 1, borderColor: C.border },
  langTxt: { color: C.text, fontSize: 12, fontWeight: 'bold' },
  profileBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.input,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  profileBtnOn: { backgroundColor: C.accent + '22', borderColor: C.accent },
  profileIcon: { fontSize: 16 },
  langOverlay: { flex: 1, backgroundColor: '#0004' },
  langSheet: { position: 'absolute', right: 16,
    backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border,
    overflow: 'hidden', minWidth: 100 },
  langOption: { paddingHorizontal: 16, paddingVertical: 12 },
  langOptionOn: { backgroundColor: C.accent + '22' },
  langOptionTxt: { color: C.muted, fontSize: 14 },
  langOptionTxtOn: { color: C.accent, fontWeight: 'bold' },
});
