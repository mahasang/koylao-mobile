import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useNotifications } from '../data/notifications';
import type { AppNotification } from '../data/notifications';
import { fmtDateTime } from '../data/purchases';
import { fmtCloseTime, fmtCountdown, msUntilClose } from '../data/rounds';
import { fmtDate } from '../utils/lottery';
import { useI18n } from '../data/i18n';
import { useAuth } from '../data/auth';
import { C } from '../theme';

const num = (v: any) => Number(v ?? 0).toLocaleString();

export default function NotificationsScreen() {
  const { t, lang } = useI18n();
  const nav = useNavigation<any>();
  const { session } = useAuth();
  const { items, closingSoon, refresh, markAllRead } = useNotifications();
  const [freshIds, setFreshIds] = useState<Set<number>>(new Set());
  const [, setTick] = useState(0);

  // Remember which ones were unread when the screen opened so they stay
  // highlighted, then mark everything read on the server.
  useFocusEffect(useCallback(() => {
    let alive = true;
    const iv = setInterval(() => setTick(n => n + 1), 1000);
    refresh().then(list => {
      if (!alive) return;
      setFreshIds(new Set((list ?? []).filter(n => !n.readAt).map(n => n.id)));
      markAllRead();
    });
    return () => { alive = false; clearInterval(iv); };
  }, [refresh, markAllRead]));

  const describe = (n: AppNotification): { icon: string; title: string; sub?: string; go?: string } | null => {
    const d = n.data;
    const fill = (k: string, vars: Record<string, string>) =>
      Object.entries(vars).reduce((acc, [key, v]) => acc.replace(`{${key}}`, v), t(k) as string);
    switch (n.kind) {
      case 'purchase_ok':
        return {
          icon: '🎫', go: 'RiskHistory',
          title: fill('notifPurchaseOk', { ticket: d.ticket_no }),
          sub: fill('notifPurchaseOkSub', { n: num(d.line_count), total: num(d.total), date: fmtDate(d.draw_date, lang) }),
        };
      case 'draw_result': {
        const won = Number(d.win_count) > 0;
        return {
          icon: won ? '🏆' : '📭', go: 'RiskHistory',
          title: won
            ? fill('notifDrawWin', { w: num(d.win_count), n: num(d.line_count), pay: num(d.pay) })
            : fill('notifDrawLose', { ticket: d.ticket_no }),
          sub: fill('notifDrawSub', { ticket: d.ticket_no, date: fmtDate(d.draw_date, lang) }),
        };
      }
      case 'deposit_approved':
        return { icon: '⬇️', go: 'Wallet', title: fill('notifDepositOk', { amount: num(d.amount) }), sub: d.note ?? undefined };
      case 'withdraw_approved':
        return { icon: '⬆️', go: 'Wallet', title: fill('notifWithdrawOk', { amount: num(d.amount) }), sub: d.note ?? undefined };
      case 'request_rejected':
        return {
          icon: '❌', go: 'Wallet',
          title: fill(d.kind === 'deposit' ? 'notifRejDeposit' : 'notifRejWithdraw', { amount: num(d.amount) }),
          sub: d.note ?? undefined,
        };
      default:
        return null;
    }
  };

  const open = (screen?: string) => {
    if (screen) nav.navigate('Tabs', { screen: 'Risk', params: { screen } });
  };

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
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
        const info = describe(n);
        if (!info) return null;
        const fresh = freshIds.has(n.id);
        return (
          <TouchableOpacity key={n.id} style={[s.card, fresh && s.fresh]} onPress={() => open(info.go)}>
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
