import { supabase } from '../lib/supabase';

export interface Flags {
  buy_enabled: boolean;
  random_generator_enabled: boolean;
  maintenance_mode: boolean;
}

const DEFAULTS: Flags = {
  buy_enabled: true,
  random_generator_enabled: true,
  maintenance_mode: false,
};

// Fails open (returns DEFAULTS) on any error, so a flags-table hiccup
// never blocks people from using the app.
export async function fetchFlags(): Promise<Flags> {
  const { data, error } = await supabase.from('feature_flags').select('key, enabled');
  if (error || !data) return DEFAULTS;
  const flags = { ...DEFAULTS };
  data.forEach((row: { key: string; enabled: boolean }) => {
    if (row.key in flags) (flags as any)[row.key] = row.enabled;
  });
  return flags;
}
