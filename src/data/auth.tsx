import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export interface ReferralStats {
  credits: number;
  referral_code: string;
  referred_count: number;
}

export interface Identifier {
  email?: string;
  phone?: string;
}

interface AuthCtx {
  session: Session | null;
  loading: boolean;
  stats: ReferralStats | null;
  refreshStats: () => Promise<void>;
  signUp: (id: Identifier, password: string, referredByCode?: string) => Promise<string | null>;
  signIn: (id: Identifier, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthCtx>({
  session: null,
  loading: false,
  stats: null,
  refreshStats: async () => {},
  signUp: async () => 'not configured',
  signIn: async () => 'not configured',
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<ReferralStats | null>(null);

  const refreshStats = async () => {
    if (!isSupabaseConfigured) return;
    const { data, error } = await supabase.rpc('get_my_referral_stats').maybeSingle();
    if (!error && data) setStats(data as ReferralStats);
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session) refreshStats();
    else setStats(null);
  }, [session?.user?.id]);

  const signUp = async (id: Identifier, password: string, referredByCode?: string) => {
    if (!isSupabaseConfigured) return 'Supabase ยังไม่ได้ตั้งค่า';
    const { error } = await supabase.auth.signUp({
      ...(id.phone ? { phone: id.phone } : { email: id.email! }),
      password,
      options: {
        data: referredByCode ? { referred_by_code: referredByCode.trim().toUpperCase() } : undefined,
      },
    } as any);
    return error ? error.message : null;
  };

  const signIn = async (id: Identifier, password: string) => {
    if (!isSupabaseConfigured) return 'Supabase ยังไม่ได้ตั้งค่า';
    const { error } = await supabase.auth.signInWithPassword(
      (id.phone ? { phone: id.phone, password } : { email: id.email!, password }) as any
    );
    return error ? error.message : null;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, loading, stats, refreshStats, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
