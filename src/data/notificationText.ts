import type { AppNotification } from './notifications';
import { fmtDate } from '../utils/lottery';
import { animalName, animalEmoji } from './lottery';
import type { Lang } from './i18n';

const num = (v: any) => Number(v ?? 0).toLocaleString();

export interface NotificationText {
  icon: string;
  title: string;
  sub?: string;
  go?: string;   // Risk-stack screen to open when tapped
  special?: boolean; // a prize: shown with the loud, distinct notification
}

// One place that turns a server notification into text, used by the in-app
// list and by the phone (OS) notification so they always say the same thing.
export function describeNotification(
  n: AppNotification,
  t: (key: string) => string | string[],
  lang: Lang,
): NotificationText | null {
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
        icon: won ? '🏆' : '📭', go: 'RiskHistory', special: won,
        title: won
          ? fill('notifDrawWin', { w: num(d.win_count), n: num(d.line_count), pay: num(d.pay) })
          : fill('notifDrawLose', { ticket: d.ticket_no }),
        sub: fill('notifDrawSub', { ticket: d.ticket_no, date: fmtDate(d.draw_date, lang) }),
      };
    }
    case 'draw_out': {
      const last2 = String(d.num ?? '').slice(-2);
      const animal = animalName(last2, lang);
      return {
        icon: '🔢', go: 'RiskResults',
        title: fill('notifDrawOut', { num: String(d.num ?? '') }),
        sub: fill('notifDrawOutSub', { date: fmtDate(d.draw_date, lang), animal: animal ? `${animalEmoji(last2)} ${animal}` : last2 }),
      };
    }
    case 'referral_joined':
      return { icon: '🤝', title: fill('notifReferral', { credits: num(d.credits) }), sub: t('notifReferralSub') as string };
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
}
