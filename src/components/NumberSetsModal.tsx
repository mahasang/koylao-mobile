import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Modal, Alert, Platform } from 'react-native';
import { buildPresets, loadSavedSets, saveSet, deleteSet } from '../data/numberSets';
import type { SavedSet } from '../data/numberSets';
import type { CartItem } from '../data/purchases';
import type { Draw } from '../data/lottery';
import { maxStakeFor } from '../utils/lottery';
import { useI18n } from '../data/i18n';
import { C } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  draws: Draw[];
  cart: CartItem[];
  stake: number;                       // stake typed on the buy screen
  onApply: (items: CartItem[]) => void; // parent dedupes and reports what was added
}

export default function NumberSetsModal({ visible, onClose, draws, cart, stake, onApply }: Props) {
  const { t } = useI18n();
  const [saved, setSaved] = useState<SavedSet[]>([]);
  const [name, setName] = useState('');
  const presets = buildPresets(draws);

  // Load the phone-local sets each time the sheet opens.
  const onShow = () => { loadSavedSets().then(setSaved); };

  const capped = (num: string): CartItem => {
    const max = maxStakeFor(num.length);
    return { num, amount: max ? Math.min(stake, max) : stake };
  };

  const save = async () => {
    if (!name.trim() || cart.length === 0) return;
    const next = await saveSet(name, cart);
    if (!next) { Alert.alert('', t('setsSaveFail') as string); return; }
    setSaved(next);
    setName('');
  };

  const remove = async (id: string) => setSaved(await deleteSet(id));

  return (
    <Modal visible={visible} animationType="slide" transparent onShow={onShow} onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.card}>
          <Text style={s.title}>📚 {t('setsTitle') as string}</Text>
          <Text style={s.hint}>{(t('setsStake') as string).replace('{v}', stake.toLocaleString())}</Text>

          <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
            <Text style={s.section}>{t('setsPresets') as string}</Text>
            {presets.map(p => (
              <View key={p.id} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{t(`set_${p.id}`) as string}</Text>
                  <Text style={s.nums}>{p.nums.join('  ')}</Text>
                </View>
                <TouchableOpacity style={s.addBtn} onPress={() => onApply(p.nums.map(capped))}>
                  <Text style={s.addTxt}>{t('setsAdd') as string}</Text>
                </TouchableOpacity>
              </View>
            ))}

            <Text style={s.section}>{t('setsSaved') as string}</Text>
            {saved.length === 0 && <Text style={s.muted}>{t('setsNone') as string}</Text>}
            {saved.map(set => (
              <View key={set.id} style={s.row}>
                <View style={{ flex: 1 }}>
                  <Text style={s.rowTitle}>{set.name} · {set.items.length}</Text>
                  <Text style={s.nums} numberOfLines={2}>{set.items.map(i => i.num).join('  ')}</Text>
                </View>
                <TouchableOpacity style={s.addBtn} onPress={() => onApply(set.items)}>
                  <Text style={s.addTxt}>{t('setsAdd') as string}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => remove(set.id)}>
                  <Text style={s.del}>{t('setsDelete') as string}</Text>
                </TouchableOpacity>
              </View>
            ))}

            {cart.length > 0 && (
              <View style={s.saveBox}>
                <Text style={s.section}>{t('setsSaveCart') as string} ({cart.length})</Text>
                <TextInput style={s.input} value={name} onChangeText={setName} maxLength={30}
                  placeholder={t('setsNamePh') as string} placeholderTextColor={C.muted} />
                <TouchableOpacity style={[s.saveBtn, !name.trim() && { opacity: 0.4 }]} disabled={!name.trim()} onPress={save}>
                  <Text style={s.saveTxt}>{t('setsSaveBtn') as string}</Text>
                </TouchableOpacity>
              </View>
            )}
            <Text style={[s.muted, { marginTop: 10 }]}>{t('setsLocalNote') as string}</Text>
          </ScrollView>

          <TouchableOpacity style={s.closeBtn} onPress={onClose}>
            <Text style={s.closeTxt}>{t('close') as string}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' },
  card: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20 },
  title: { color: C.text, fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  hint: { color: C.muted, fontSize: 12, textAlign: 'center', marginTop: 4, marginBottom: 8 },
  section: { color: C.text, fontWeight: 'bold', fontSize: 13, marginTop: 12, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.input, borderRadius: 12,
    padding: 10, marginBottom: 8 },
  rowTitle: { color: C.text, fontWeight: 'bold', fontSize: 13 },
  nums: { color: C.muted, fontFamily: 'Courier New', fontSize: 12, marginTop: 3 },
  addBtn: { backgroundColor: C.accent, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
  addTxt: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  del: { color: '#c0392b', fontSize: 12, fontWeight: 'bold' },
  muted: { color: C.muted, fontSize: 12 },
  saveBox: { marginTop: 4 },
  input: { backgroundColor: C.input, borderRadius: 10, padding: 12, color: C.text, fontSize: 14, marginBottom: 8 },
  saveBtn: { backgroundColor: C.violet, borderRadius: 10, padding: 12, alignItems: 'center' },
  saveTxt: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  closeBtn: { paddingVertical: 14, alignItems: 'center' },
  closeTxt: { color: C.muted, fontWeight: 'bold', fontSize: 14 },
});
