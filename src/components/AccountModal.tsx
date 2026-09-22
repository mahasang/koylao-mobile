import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Modal, Platform, ActivityIndicator } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useI18n } from '../data/i18n';
import { useAuth } from '../data/auth';
import { isSupabaseConfigured } from '../lib/supabase';
import { toE164Phone } from '../utils/phone';
import { C } from '../theme';

export default function AccountModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { session, stats, signIn, signUp, signOut } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [method, setMethod] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [refCode, setRefCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const reset = () => { setEmail(''); setPhone(''); setPassword(''); setRefCode(''); setError(null); };

  const submit = async () => {
    if (!isSupabaseConfigured) { setError(t('authNotConfigured') as string); return; }
    const idValue = method === 'email' ? email.trim() : phone.trim();
    if (!idValue || !password) { setError(t('authFillFields') as string); return; }
    setBusy(true);
    setError(null);
    const id = method === 'email' ? { email: idValue } : { phone: toE164Phone(idValue) };
    const err = mode === 'login'
      ? await signIn(id, password)
      : await signUp(id, password, refCode);
    setBusy(false);
    if (err) setError(err);
    else reset();
  };

  const copyCode = async () => {
    if (!stats?.referral_code) return;
    await Clipboard.setStringAsync(stats.referral_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const close = () => { reset(); onClose(); };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={s.overlay}>
        <View style={s.card}>
          {session ? (
            <>
              <Text style={s.icon}>👤</Text>
              <Text style={s.title}>{t('profileTitle') as string}</Text>
              <Text style={s.email}>{session.user.email}</Text>

              <View style={s.statRow}>
                <View style={s.statBox}>
                  <Text style={s.statNum}>{stats?.credits ?? 0}</Text>
                  <Text style={s.statLabel}>{t('creditsLabel') as string}</Text>
                </View>
                <View style={s.statBox}>
                  <Text style={s.statNum}>{stats?.referred_count ?? 0}</Text>
                  <Text style={s.statLabel}>{t('referredLabel') as string}</Text>
                </View>
              </View>

              <Text style={s.codeLabel}>{t('yourCode') as string}</Text>
              <TouchableOpacity style={s.codeBox} onPress={copyCode}>
                <Text style={s.codeTxt}>{stats?.referral_code ?? '——————'}</Text>
                <Text style={s.copyTxt}>{copied ? t('copiedCode') as string : t('copyCode') as string}</Text>
              </TouchableOpacity>
              <Text style={s.hint}>{t('referralHint') as string}</Text>

              <TouchableOpacity style={s.logoutBtn} onPress={async () => { await signOut(); close(); }}>
                <Text style={s.logoutTxt}>{t('logoutBtn') as string}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={s.tabRow}>
                <TouchableOpacity style={[s.tabBtn, mode === 'login' && s.tabBtnOn]} onPress={() => { setMode('login'); setError(null); }}>
                  <Text style={[s.tabTxt, mode === 'login' && s.tabTxtOn]}>{t('authLoginTab') as string}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.tabBtn, mode === 'signup' && s.tabBtnOn]} onPress={() => { setMode('signup'); setError(null); }}>
                  <Text style={[s.tabTxt, mode === 'signup' && s.tabTxtOn]}>{t('authSignupTab') as string}</Text>
                </TouchableOpacity>
              </View>

              <View style={s.methodRow}>
                <TouchableOpacity style={[s.methodBtn, method === 'email' && s.methodBtnOn]} onPress={() => { setMethod('email'); setError(null); }}>
                  <Text style={[s.methodTxt, method === 'email' && s.methodTxtOn]}>{t('methodEmail') as string}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.methodBtn, method === 'phone' && s.methodBtnOn]} onPress={() => { setMethod('phone'); setError(null); }}>
                  <Text style={[s.methodTxt, method === 'phone' && s.methodTxtOn]}>{t('methodPhone') as string}</Text>
                </TouchableOpacity>
              </View>

              {method === 'email' ? (
                <TextInput
                  style={s.input} placeholder={t('emailLabel') as string} placeholderTextColor={C.muted}
                  value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address"
                />
              ) : (
                <TextInput
                  style={s.input} placeholder={t('phonePh') as string} placeholderTextColor={C.muted}
                  value={phone} onChangeText={setPhone} keyboardType="phone-pad"
                />
              )}
              <TextInput
                style={s.input} placeholder={t('passwordLabel') as string} placeholderTextColor={C.muted}
                value={password} onChangeText={setPassword} secureTextEntry
              />
              {mode === 'signup' && (
                <TextInput
                  style={s.input} placeholder={t('referralInputPh') as string} placeholderTextColor={C.muted}
                  value={refCode} onChangeText={setRefCode} autoCapitalize="characters"
                />
              )}
              {mode === 'signup' && <Text style={s.fieldHint}>{t('referralInputLabel') as string}</Text>}

              {error && <Text style={s.error}>{error}</Text>}

              <TouchableOpacity style={s.submitBtn} onPress={submit} disabled={busy}>
                {busy
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={s.submitTxt}>{(mode === 'login' ? t('loginBtn') : t('signupBtn')) as string}</Text>}
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={s.closeBtn} onPress={close}>
            <Text style={s.closeTxt}>{t('close') as string}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' },
  card: { backgroundColor: C.card, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, paddingBottom: Platform.OS === 'ios' ? 40 : 24, alignItems: 'center' },
  icon: { fontSize: 40, marginBottom: 8 },
  title: { color: C.text, fontSize: 18, fontWeight: 'bold', marginBottom: 4 },
  email: { color: C.muted, fontSize: 13, marginBottom: 16 },
  statRow: { flexDirection: 'row', gap: 12, width: '100%', marginBottom: 16 },
  statBox: { flex: 1, backgroundColor: C.input, borderRadius: 12, padding: 14, alignItems: 'center' },
  statNum: { color: C.accent, fontSize: 24, fontWeight: 'bold' },
  statLabel: { color: C.muted, fontSize: 12, marginTop: 2, textAlign: 'center' },
  codeLabel: { color: C.muted, fontSize: 12, alignSelf: 'flex-start', marginBottom: 6 },
  codeBox: { width: '100%', backgroundColor: C.input, borderRadius: 10, borderWidth: 1, borderColor: C.border,
    padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  codeTxt: { color: C.text, fontSize: 20, fontWeight: 'bold', letterSpacing: 3, fontFamily: 'Courier New' },
  copyTxt: { color: C.accent, fontSize: 12, fontWeight: 'bold' },
  hint: { color: C.muted, fontSize: 11, textAlign: 'center', marginBottom: 20, lineHeight: 16 },
  logoutBtn: { width: '100%', backgroundColor: '#FCEAEA', borderWidth: 1, borderColor: '#e57373',
    borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 4 },
  logoutTxt: { color: '#c0392b', fontWeight: 'bold', fontSize: 15 },
  tabRow: { flexDirection: 'row', backgroundColor: C.input, borderRadius: 10, padding: 4, width: '100%', marginBottom: 16 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  tabBtnOn: { backgroundColor: C.accent },
  tabTxt: { color: C.muted, fontWeight: 'bold', fontSize: 13 },
  tabTxtOn: { color: '#fff' },
  methodRow: { flexDirection: 'row', gap: 8, width: '100%', marginBottom: 10 },
  methodBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center',
    backgroundColor: C.input, borderWidth: 1, borderColor: C.border },
  methodBtnOn: { backgroundColor: C.accent + '22', borderColor: C.accent },
  methodTxt: { color: C.muted, fontSize: 13, fontWeight: 'bold' },
  methodTxtOn: { color: C.accent },
  input: { width: '100%', backgroundColor: C.input, borderRadius: 10, borderWidth: 1, borderColor: C.border,
    padding: 14, color: C.text, fontSize: 14, marginBottom: 10 },
  fieldHint: { color: C.muted, fontSize: 11, alignSelf: 'flex-start', marginTop: -6, marginBottom: 10 },
  error: { color: '#e57373', fontSize: 13, marginBottom: 10, textAlign: 'center' },
  submitBtn: { width: '100%', backgroundColor: C.accent, borderRadius: 10, padding: 14,
    alignItems: 'center', marginBottom: 4, minHeight: 48, justifyContent: 'center' },
  submitTxt: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  closeBtn: { paddingVertical: 12, marginTop: 8 },
  closeTxt: { color: C.muted, fontSize: 14, fontWeight: 'bold' },
});
