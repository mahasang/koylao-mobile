import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Linking, Switch } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useNotifications } from '../data/notifications';
import { describeNotification } from '../data/notificationText';
import { hasPermission, canAskPermission, ensurePermission, getPrefs, setPrefs } from '../lib/deviceNotifications';
import type { NotifPrefs } from '../lib/deviceNotifications';
import { fmtDateTime } from '../data/purchases';
import { fmtCloseTime, fmtCountdown, msUntilClose } from '../data/rounds';
import { fmtDate } from '../utils/lottery';
import { useI18n } from '../data/i18n';
import { useAuth } from '../data/auth';
import { C } from '../theme';

export default function NotificationsScreen() {
  const { t, lang } = useI18n();
  const nav = useNavigation<any>();
  const { session } = useAuth();
  const { items, closingSoon, refresh, markAllRead } = useNotifications();
  const [freshIds, setFreshIds] = useState<Set<number>>(new Set());
  const [, setTick] = useState(0);
  const [phoneOn, setPhoneOn] = useState<boolean | null>(null);
  const [canAsk, setCanAsk] = useState(false);
  const [prefs, setPrefsState] = useState<NotifPrefs>({ closing: true, teaser: true });

  // Remember which ones were unread when the screen opened so they stay
  // highlighted, then mark everything read on the server.
  useFocusEffect(useCallback(() => {
    let alive = true;
    const iv = setInterval(() => setTick(n => n + 1), 1000);
    hasPermission().then(setPhoneOn);
    canAskPermission().then(setCanAsk);
    getPrefs().then(setPrefsState);
    refresh().then(list => {
      if (!alive) return;
      setFreshIds(new Set((list ?? []).filter(n => !n.readAt).map(n => n.id)));
      markAllRead();
    });
    return () => { alive = false; clearInterval(iv); };
  }, [refresh, markAllRead]));

  const open = (screen?: string) => {
    if (screen) nav.navigate('Tabs', { screen: 'Risk', params: { screen } });
  };

  const changePref = async (key: keyof NotifPrefs, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefsState(next);
    await setPrefs(next);
    refresh();   // reschedules (or cancels) the phone reminders right away
  };

  const enablePhone = async () => {
    if (canAsk) {
      setPhoneOn(await ensurePermission());
      setCanAsk(await canAskPermission());
    } else {
      Linking.openSettings();
    }
  };

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      {phoneOn === false && (
        <TouchableOpacity style={[s.card, s.enable]} onPress={enablePhone}>
          <Text style={s.icon}>📲</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{t('notifEnablePhone') as string}</Text>
            <Text style={s.sub}>{(canAsk ? t('notifEnableBtn') : t('notifOpenSettings')) as string}</Text>
          </View>
        </TouchableOpacity>
      )}
      {phoneOn === true && <Text style={s.on}>✅ {t('notifPhoneOn') as string}</Text>}

      <View style={s.prefs}>
        <Text style={s.prefsTitle}>{t('notifPrefsTitle') as string}</Text>
        <View style={s.prefRow}>
          <Text style={s.prefTxt}>{t('notifPrefClosing') as string}</Text>
          <Switch value={prefs.closing} onValueChange={v => changePref('closing', v)} />
        </View>
        <View style={s.prefRow}>
          <Text style={s.prefTxt}>{t('notifPrefTeaser') as string}</Text>
          <Switch value={prefs.teaser} onValueChange={v => changePref('teaser', v)} />
        </View>
      </View>
      {closingSoon && (
        <TouchableOpacity style={[s.card, s.soon]} onPress={() => nav.navigate('Tabs', { screen: 'Risk', params: { screen: 'RiskBuy' } })}>
          <Text style={s.icon}>⏰</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>
              {(t('notifClosingSoon') as string).replace('{v}', fmtCountdown(msUntilClose(closingSoon)))}
            </Text>
            <Text style={s.sub}>
              {(t('notifClosingSoonSub') as string)
                .replace('{date}', fmtDate(closingSoon.drawDate, lang))
                .replace('{time}', fmtCloseTime(closingSoon.closesAt))}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {session && items.map(n => {
        const info = describeNotification(n, t, lang);
        if (!info) return null;
        const fresh = freshIds.has(n.id);
        return (
          <TouchableOpacity key={n.id} style={[s.card, fresh && s.fresh, info.special && s.prize]} onPress={() => open(info.go)}>
            <Text style={s.icon}>{info.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{info.title}</Text>
              {info.sub ? <Text style={s.sub}>{info.sub}</Text> : null}
              <Text style={s.time}>{fmtDateTime(n.createdAt, lang)}</Text>
            </View>
            {fresh && <View style={s.dot} />}
          </TouchableOpacity>
        );
      })}

      {!closingSoon && (!session || items.length === 0) && (
        <Text style={s.empty}>{t('notifEmpty') as string}</Text>
      )}
      <Text style={s.note}>{t('notifNoPush') as string}</Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: C.bg },
  content: { padding: 16, paddingBottom: 40 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.card, borderRadius: 14,
    padding: 14, marginBottom: 10 },
  enable: { backgroundColor: C.accent + '14', borderWidth: 1, borderColor: C.accent },
  on: { color: '#2e9e4f', fontSize: 12, fontWeight: 'bold', textAlign: 'center', marginBottom: 10 },
  prize: { backgroundColor: '#f0c04026', borderWidth: 1.5, borderColor: '#e8a020' },
  prefs: { backgroundColor: C.card, borderRadius: 14, padding: 14, marginBottom: 12 },
  prefsTitle: { color: C.text, fontWeight: 'bold', fontSize: 13, marginBottom: 6 },
  prefRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingVertical: 4 },
  prefTxt: { flex: 1, color: C.muted, fontSize: 13 },
  soon: { backgroundColor: '#f0c04026', borderWidth: 1, borderColor: '#e8a020' },
  fresh: { borderWidth: 1, borderColor: C.accent },
  icon: { fontSize: 26 },
  title: { color: C.text, fontWeight: 'bold', fontSize: 14, lineHeight: 20 },
  sub: { color: C.muted, fontSize: 12, marginTop: 2 },
  time: { color: C.muted, fontSize: 11, marginTop: 4 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.accent },
  empty: { color: C.muted, textAlign: 'center', marginVertical: 30, fontSize: 14 },
  note: { color: C.muted, fontSize: 11, textAlign: 'center', marginTop: 16, lineHeight: 16 },
});
