import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';

export interface ReferralStats {
  credits: number;
  referral_code: string;
  referred_count: number;
}

interface AuthCtx {
  session: Session | null;
  loading: boolean;
  stats: ReferralStats | null;
  refreshStats: () => Promise<void>;
  signUp: (email: string, password: string, referredByCode?: string) => Promise<string | null>;
  signIn: (email: string, password: string) => Promise<string | null>;
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

  const signUp = async (email: string, password: string, referredByCode?: string) => {
    if (!isSupabaseConfigured) return 'Supabase ยังไม่ได้ตั้งค่า';
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: referredByCode ? { referred_by_code: referredByCode.trim().toUpperCase() } : undefined,
      },
    });
    return error ? error.message : null;
  };

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseConfigured) return 'Supabase ยังไม่ได้ตั้งค่า';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
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
