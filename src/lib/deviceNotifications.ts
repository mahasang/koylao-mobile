import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Notifications shown by the phone's OS. Everything here is scheduled or fired
// by the app itself — nothing comes from a push server, so it needs no
// credentials, but it can only run while the app process is allowed to run.

const CHANNEL = 'default';
const WIN_CHANNEL = 'win';
const PREFS_KEY = 'koylao_notification_prefs_v1';
export const TEASER_ID_PREFIX = 'teaser-';
const TEASER_HOUR = 9;
const SEEN_KEY = 'koylao_seen_notification_id_v1';
export const CLOSING_ID_PREFIX = 'closing-';
export const CLOSING_LEAD_MS = 30 * 60 * 1000;

let initialised = false;

export async function initDeviceNotifications() {
  if (initialised) return;
  initialised = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false,
    }),
  });
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'KoyLao',
      importance: Notifications.AndroidImportance.HIGH,
    });
    // Wins get their own channel: loudest importance, sound and a long vibration,
    // so a prize does not look like any other alert.
    await Notifications.setNotificationChannelAsync(WIN_CHANNEL, {
      name: 'KoyLao — prizes',
      importance: Notifications.AndroidImportance.MAX,
      sound: 'default',
      vibrationPattern: [0, 400, 200, 400, 200, 800],
      lightColor: '#f0c040',
    });
  }
}

export async function hasPermission(): Promise<boolean> {
  try {
    return (await Notifications.getPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function canAskPermission(): Promise<boolean> {
  try {
    const p = await Notifications.getPermissionsAsync();
    return !p.granted && p.canAskAgain;
  } catch {
    return false;
  }
}

// Asks the OS (the system dialog only appears if it has not been refused for good).
export async function ensurePermission(): Promise<boolean> {
  try {
    const cur = await Notifications.getPermissionsAsync();
    if (cur.granted) return true;
    if (!cur.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function showNow(
  title: string, body: string | undefined, data: Record<string, any>, special = false,
) {
  if (!(await hasPermission())) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data, sound: special ? 'default' : false },
      trigger: Platform.OS === 'android' ? { channelId: special ? WIN_CHANNEL : CHANNEL } : null,
    });
  } catch { /* a failed banner must never break the app */ }
}

// One reminder per draw, replaced (not duplicated) each time it is scheduled.
export async function scheduleClosingReminder(drawDate: string, closesAtIso: string, title: string, body: string) {
  if (!(await hasPermission())) return;
  const when = new Date(new Date(closesAtIso).getTime() - CLOSING_LEAD_MS);
  if (when.getTime() <= Date.now()) return;
  const identifier = `${CLOSING_ID_PREFIX}${drawDate}`;
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier);
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: { title, body, data: { screen: 'RiskBuy' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: CHANNEL },
    });
  } catch { /* ignore */ }
}

// Drops every pending closing reminder except the ones in `keep` (draw dates).
export async function pruneClosingReminders(keep: string[]) {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(all
      .filter(n => n.identifier.startsWith(CLOSING_ID_PREFIX) && !keep.includes(n.identifier.slice(CLOSING_ID_PREFIX.length)))
      .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  } catch { /* ignore */ }
}

// Highest server-notification id already handled on this phone, so a
// notification is shown as an OS banner once and old history never is.
export async function getSeenId(): Promise<number | null> {
  try {
    const v = await AsyncStorage.getItem(SEEN_KEY);
    return v == null ? null : Number(v);
  } catch {
    return null;
  }
}

export async function setSeenId(id: number) {
  try { await AsyncStorage.setItem(SEEN_KEY, String(id)); } catch { /* ignore */ }
}

// ---- preferences (what the customer chose to receive; both default to on) ----
export interface NotifPrefs { closing: boolean; teaser: boolean; }

export async function getPrefs(): Promise<NotifPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    const p = raw ? JSON.parse(raw) : {};
    return { closing: p.closing !== false, teaser: p.teaser !== false };
  } catch {
    return { closing: true, teaser: true };
  }
}

export async function setPrefs(p: NotifPrefs) {
  try { await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

// ---- daily "number of the day" (09:00 device time on draw days) ----
export async function scheduleTeasers(items: { date: string; title: string; body: string; screen: string }[]) {
  if (!(await hasPermission())) return;
  const keep = new Set(items.map(i => `${TEASER_ID_PREFIX}${i.date}`));
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(all
      .filter(n => n.identifier.startsWith(TEASER_ID_PREFIX) && !keep.has(n.identifier))
      .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier)));
    for (const i of items) {
      const [y, m, d] = i.date.split('-').map(Number);
      const when = new Date(y, m - 1, d, TEASER_HOUR, 0, 0);
      if (when.getTime() <= Date.now()) continue;
      const identifier = `${TEASER_ID_PREFIX}${i.date}`;
      await Notifications.cancelScheduledNotificationAsync(identifier);
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: { title: i.title, body: i.body, data: { tab: 'Lucky' } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: CHANNEL },
      });
    }
  } catch { /* ignore */ }
}

export async function cancelTeasers() {
  try {
    const all = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(all
      .filter(n => n.identifier.startsWith(TEASER_ID_PREFIX))
      .map(n => Notifications.cancelScheduledNotificationAsync(n.identifier)));
  } catch { /* ignore */ }
}
