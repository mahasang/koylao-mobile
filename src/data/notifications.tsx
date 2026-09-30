import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './auth';
import { fetchRounds, isRoundOpen, msUntilClose, fmtCloseTime } from './rounds';
import type { Round } from './rounds';
import { useI18n } from './i18n';
import { describeNotification } from './notificationText';
import { fmtDate } from '../utils/lottery';
import {
  initDeviceNotifications, showNow, getSeenId, setSeenId, scheduleClosingReminder, pruneClosingReminders,
  getPrefs, scheduleTeasers, cancelTeasers,
} from '../lib/deviceNotifications';
import { buildTeasers } from './teasers';
import { getDraws } from './lottery';

export interface AppNotification {
  id: number;
  kind: string;
  data: Record<string, any>;
  readAt: string | null;
  createdAt: string;
}

// The "closing soon" reminder is worked out on the phone from the server's
// closing time — nothing is stored for it.
const CLOSING_SOON_MS = 2 * 60 * 60 * 1000;
const REFRESH_MS = 60 * 1000;

interface Ctx {
  items: AppNotification[];
  unread: number;
  closingSoon: Round | null;
  refresh: () => Promise<AppNotification[] | null>;
  markAllRead: () => Promise<void>;
}

const NotificationsContext = createContext<Ctx>({
  items: [], unread: 0, closingSoon: null, refresh: async () => null, markAllRead: async () => {},
});

export async function fetchNotifications(limit = 50): Promise<AppNotification[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select('id, kind, data, read_at, created_at')
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((r: any) => ({
    id: r.id, kind: r.kind, data: r.data ?? {}, readAt: r.read_at, createdAt: r.created_at,
  }));
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { t, lang } = useI18n();
  const userId = session?.user?.id;
  const [items, setItems] = useState<AppNotification[]>([]);
  const [closingSoon, setClosingSoon] = useState<Round | null>(null);

  // Phone (OS) banner for each server notification this phone has not shown yet.
  // The first run only records where we are, so old history is never replayed.
  const announceNew = useCallback(async (list: AppNotification[]) => {
    const maxId = list.reduce((m, n) => Math.max(m, n.id), 0);
    const seen = await getSeenId();
    if (seen === null) { await setSeenId(maxId); return; }
    const fresh = list.filter(n => n.id > seen && !n.readAt).sort((a, b) => a.id - b.id).slice(-3);
    for (const n of fresh) {
      const info = describeNotification(n, t, lang);
      if (info) await showNow(info.title, info.sub, { screen: info.go ?? 'RiskHome' }, !!info.special);
    }
    if (maxId > seen) await setSeenId(maxId);
  }, [t, lang]);

  // A reminder 30 minutes before each open draw closes, unless the customer
  // already bought for that draw.
  const syncClosingReminders = useCallback(async (open: Round[]) => {
    const prefs = await getPrefs();
    if (!prefs.closing) { await pruneClosingReminders([]); return; }
    let bought = new Set<string>();
    if (userId && open.length > 0) {
      const { data } = await supabase.from('purchases').select('draw_date').in('draw_date', open.map(r => r.drawDate));
      bought = new Set((data ?? []).map((r: { draw_date: string }) => r.draw_date));
    }
    const wanted = open.filter(r => !bought.has(r.drawDate)).slice(0, 5);
    await pruneClosingReminders(wanted.map(r => r.drawDate));
    for (const r of wanted) {
      await scheduleClosingReminder(
        r.drawDate, r.closesAt,
        t('devClosingTitle') as string,
        (t('devClosingBody') as string).replace('{date}', fmtDate(r.drawDate, lang)).replace('{time}', fmtCloseTime(r.closesAt)),
      );
    }
  }, [userId, t, lang]);

  // "Number of the day" — a 09:00 nudge on each of the next draw days.
  const syncTeasers = useCallback(async () => {
    const prefs = await getPrefs();
    if (!prefs.teaser) { await cancelTeasers(); return; }
    await scheduleTeasers(buildTeasers(getDraws(), t, lang));
  }, [t, lang]);

  // Returns the freshly loaded list (null if it could not be loaded).
  const refresh = useCallback(async (): Promise<AppNotification[] | null> => {
    if (!isSupabaseConfigured) return null;
    const [list, rounds] = await Promise.all([
      userId ? fetchNotifications().catch(() => null) : Promise.resolve([] as AppNotification[]),
      fetchRounds().catch(() => null),
    ]);
    const open = rounds ? rounds.filter(isRoundOpen) : null;
    const next = open?.[0] ?? null;
    if (list) setItems(list);
    setClosingSoon(next && msUntilClose(next) < CLOSING_SOON_MS ? next : null);
    if (list && userId) await announceNew(list).catch(() => {});
    if (open) await syncClosingReminders(open).catch(() => {});
    await syncTeasers().catch(() => {});
    return list;
  }, [userId, announceNew, syncClosingReminders, syncTeasers]);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const { error } = await supabase.rpc('mark_notifications_read');
    if (!error) setItems(prev => prev.map(n => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
  }, [userId]);

  useEffect(() => { initDeviceNotifications(); }, []);

  useEffect(() => {
    const first = setTimeout(refresh, 0);
    const iv = setInterval(refresh, REFRESH_MS);
    return () => { clearTimeout(first); clearInterval(iv); };
  }, [refresh]);

  const unread = items.filter(n => !n.readAt).length;

  return (
    <NotificationsContext.Provider value={{ items, unread, closingSoon, refresh, markAllRead }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export const useNotifications = () => useContext(NotificationsContext);
