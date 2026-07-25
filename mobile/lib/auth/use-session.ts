// Hook que expone la sesión Supabase y el perfil Zaltyko actual.
// Combina:
//   - Sesión Supabase (tokens, user) desde secureStore.
//   - Perfil Zaltyko desde GET /api/me (resuelve role, academyId).
// Refresca el token automáticamente con onAuthStateChange.

import { useCallback, useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { apiGet } from '@/lib/api/client';
import { supabase } from './supabase';

export type ZaltykoRole = 'super_admin' | 'owner' | 'admin' | 'coach' | 'parent' | 'athlete' | 'viewer';

export interface ZaltykoProfile {
  id: string;
  email: string;
  fullName: string | null;
  role: ZaltykoRole;
  academyId: string | null;
  academyName: string | null;
}

export interface SessionState {
  status: 'loading' | 'authenticated' | 'unauthenticated';
  session: Session | null;
  profile: ZaltykoProfile | null;
  // Token fresco para llamadas a /api/*. Se actualiza con cada cambio
  // de sesión y se rota solo en api/client.ts cuando hay 401.
  accessToken: string | null;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const EMPTY: SessionState = {
  status: 'loading',
  session: null,
  profile: null,
  accessToken: null,
  refresh: async () => {},
  signOut: async () => {},
};

export function useSession(): SessionState {
  const [state, setState] = useState<SessionState>(EMPTY);

  const fetchProfile = useCallback(async (token: string): Promise<ZaltykoProfile | null> => {
    try {
      const data = await apiGet<ZaltykoProfile>('/api/me', { token });
      return data;
    } catch (err) {
      console.warn('[useSession] /api/me falló:', err);
      return null;
    }
  }, []);

  const hydrate = useCallback(
    async (session: Session | null) => {
      if (!session) {
        setState({
          ...EMPTY,
          status: 'unauthenticated',
          refresh: state.refresh,
          signOut: state.signOut,
        });
        return;
      }
      const profile = await fetchProfile(session.access_token);
      setState({
        status: 'authenticated',
        session,
        profile,
        accessToken: session.access_token,
        refresh: state.refresh,
        signOut: state.signOut,
      });
    },
    [fetchProfile, state.refresh, state.signOut]
  );

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      console.warn('[useSession] refresh falló:', error.message);
      return;
    }
    await hydrate(data.session ?? null);
  }, [hydrate]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setState({ ...EMPTY, status: 'unauthenticated' });
  }, []);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) hydrate(session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (mounted) hydrate(session);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [hydrate]);

  return { ...state, refresh, signOut };
}