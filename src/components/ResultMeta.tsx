import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useI18n } from '../data/i18n';
import { fmtDateTime } from '../data/purchases';
import type { Draw } from '../data/lottery';
import { C } from '../theme';

// Status + provenance of a draw result: who published it, when, and whether
// it is confirmed yet. Results without server metadata (the bundled history)
// show only their origin.
export default function ResultMeta({ draw, compact }: { draw: Draw; compact?: boolean }) {
  const { t, lang } = useI18n();
  const pending = draw.status === 'pending';
  const known = draw.status === 'pending' || draw.status === 'confirmed';

  const sourceLabel = draw.source === 'laodl' ? t('srcLaodl')
    : draw.source === 'manual' ? t('srcManual')
    : known ? draw.source ?? '' : t('srcBundled');
  const when = draw.status === 'confirmed' ? draw.confirmedAt ?? draw.updatedAt : draw.updatedAt;

  return (
    <View style={s.wrap}>
      {known && (
        <View style={[s.badge, pending ? s.badgePending : s.badgeOk]}>
          <Text style={[s.badgeTxt, pending ? s.badgePendingTxt : s.badgeOkTxt]}>
            {pending ? '⏳ ' : '✅ '}{(pending ? t('resultPending') : t('resultConfirmed')) as string}
          </Text>
        </View>
      )}
      {!compact && (
        <>
          <Text style={s.line}>{t('resultSource') as string}: {sourceLabel as string}</Text>
          {when ? <Text style={s.line}>{t('resultUpdated') as string}: {fmtDateTime(when, lang)}</Text> : null}
          {pending && <Text style={s.warn}>{t('resultPendingNote') as string}</Text>}
        </>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', marginTop: 8 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, marginBottom: 4, borderWidth: 1 },
  badgeOk: { backgroundColor: '#2e9e4f22', borderColor: '#2e9e4f' },
  badgePending: { backgroundColor: '#f0c04033', borderColor: '#e8a020' },
  badgeTxt: { fontSize: 12, fontWeight: 'bold' },
  badgeOkTxt: { color: '#2e9e4f' },
  badgePendingTxt: { color: '#b57a00' },
  line: { color: C.muted, fontSize: 11, marginTop: 2, textAlign: 'center' },
  warn: { color: '#b57a00', fontSize: 11, marginTop: 6, textAlign: 'center', lineHeight: 16 },
});
