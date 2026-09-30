import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { useAuth } from './auth';
import { fetchRounds, isRoundOpen, msUntilClose } from './rounds';
import type { Round } from './rounds';

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
  const userId = session?.user?.id;
  const [items, setItems] = useState<AppNotification[]>([]);
  const [closingSoon, setClosingSoon] = useState<Round | null>(null);

  // Returns the freshly loaded list (null if it could not be loaded).
  const refresh = useCallback(async (): Promise<AppNotification[] | null> => {
    if (!isSupabaseConfigured) return null;
    const [list, next] = await Promise.all([
      userId ? fetchNotifications().catch(() => null) : Promise.resolve([] as AppNotification[]),
      fetchRounds().then(rs => rs.find(isRoundOpen) ?? null).catch(() => null),
    ]);
    if (list) setItems(list);
    setClosingSoon(next && msUntilClose(next) < CLOSING_SOON_MS ? next : null);
    return list;
  }, [userId]);

  const markAllRead = useCallback(async () => {
    if (!userId) return;
    const { error } = await supabase.rpc('mark_notifications_read');
    if (!error) setItems(prev => prev.map(n => (n.readAt ? n : { ...n, readAt: new Date().toISOString() })));
  }, [userId]);

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
