// Fuente única de la sesión Supabase + perfil Zaltyko. Antes cada
// pantalla llamaba a useSession() de forma independiente, lo que
// disparaba su propio fetch a /api/me y su propio listener de
// onAuthStateChange por cada mount — visible como un parpadeo en
// blanco al cambiar de tab bajo red lenta. Ahora vive una sola vez
// aquí y las pantallas solo leen del Context.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';

import { apiGet } from '@/lib/api/client';
<<<<<<< HEAD
import { normalizeMeProfile, type RawMeProfile, type ZaltykoProfile, type ZaltykoRole } from './roles';
import { supabase } from './supabase';

// El contrato de roles vive en './roles' (ZAL-768). Se re-exporta aquí
// para no tocar los ~12 imports existentes de '@/lib/auth/use-session',
// que a su vez re-exporta desde este archivo.
export type { ZaltykoProfile, ZaltykoRole };
=======
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
>>>>>>> origin/main

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

const EMPTY: Omit<SessionState, 'refresh' | 'signOut'> = {
  status: 'loading',
  session: null,
  profile: null,
  accessToken: null,
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<SessionState, 'refresh' | 'signOut'>>(EMPTY);

  const fetchProfile = useCallback(async (token: string): Promise<ZaltykoProfile | null> => {
    // Un intento extra antes de rendirnos: fallos transitorios (red,
    // fetch cancelado al pasar la app a segundo plano) no deberían
    // bastar para tirar la sesión — ver hydrate() más abajo.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
<<<<<<< HEAD
        // /api/me devuelve el rol como string del enum de Postgres.
        // Se estrecha en runtime: un rol que mobile no conoce cae a
        // `viewer`, nunca a `parent` (ver roles.ts).
        const raw = await apiGet<RawMeProfile>('/api/me', { token });
        return normalizeMeProfile(raw);
=======
        return await apiGet<ZaltykoProfile>('/api/me', { token });
>>>>>>> origin/main
      } catch (err) {
        console.warn('[SessionProvider] /api/me falló:', err);
        if (attempt === 1) return null;
        await new Promise((resolve) => setTimeout(resolve, 800));
      }
    }
    return null;
  }, []);

  const hydrate = useCallback(
    async (session: Session | null) => {
      if (!session) {
        setState({ ...EMPTY, status: 'unauthenticated' });
        return;
      }
      const profile = await fetchProfile(session.access_token);
      setState((prev) => ({
        status: 'authenticated',
        session,
        // Si el fetch (con reintento) sigue fallando pero ya había un
        // perfil cargado, lo conservamos — un error transitorio no
        // debe tirar una sesión ya funcionando a pantalla en blanco.
        profile: profile ?? prev.profile,
        accessToken: session.access_token,
      }));
    },
    [fetchProfile]
  );

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      console.warn('[SessionProvider] refresh falló:', error.message);
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

  return (
    <SessionContext.Provider value={{ ...state, refresh, signOut }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession() debe usarse dentro de <SessionProvider>');
  }
  return ctx;
}
