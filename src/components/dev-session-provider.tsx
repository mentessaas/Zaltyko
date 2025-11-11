"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { isDevFeaturesEnabled } from "@/lib/dev";

type DevSession = {
  userId: string;
  profileId: string;
  tenantId: string;
  academyId: string;
  academyName?: string;
};

interface DevSessionContextValue {
  session: DevSession | null;
  loading: boolean;
  refresh: () => Promise<void>;
  update: (patch: Partial<DevSession>) => void;
}

const DevSessionContext = createContext<DevSessionContextValue | undefined>(undefined);

const STORAGE_KEY = "gymna_dev_session";

async function fetchDevSession(): Promise<DevSession | null> {
  try {
    const response = await fetch("/api/dev/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as DevSession;
    return data;
  } catch (error) {
    console.warn("No se pudo obtener la sesión demo", error);
    return null;
  }
}

export function DevSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<DevSession | null>(null);
  const [loading, setLoading] = useState(isDevFeaturesEnabled);

  const persist = useCallback((value: DevSession | null) => {
    if (typeof window === "undefined") return;
    if (value) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!isDevFeaturesEnabled || typeof window === "undefined") return;
    setLoading(true);
    const data = await fetchDevSession();
    if (data) {
      setSession(data);
      persist(data);
    }
    setLoading(false);
  }, [persist]);

  const update = useCallback(
    (patch: Partial<DevSession>) => {
      setSession((prev) => {
        const merged = { ...prev, ...patch } as DevSession;
        persist(merged);
        return merged;
      });
    },
    [persist]
  );

  useEffect(() => {
    if (!isDevFeaturesEnabled || typeof window === "undefined") return;

    const cached = window.localStorage.getItem(STORAGE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as DevSession;
        setSession(parsed);
        setLoading(false);
      } catch (error) {
        console.warn("Sesión demo inválida en caché", error);
        window.localStorage.removeItem(STORAGE_KEY);
      }
    }

    refresh();
  }, [refresh]);

  const value = useMemo<DevSessionContextValue>(
    () => ({ session, loading, refresh, update }),
    [loading, refresh, session, update]
  );

  const safeValue = useMemo<DevSessionContextValue>(() => {
    if (!isDevFeaturesEnabled) {
      return {
        session: null,
        loading: false,
        refresh: async () => {},
        update: () => {},
      };
    }
    return value;
  }, [value]);

  return <DevSessionContext.Provider value={safeValue}>{children}</DevSessionContext.Provider>;
}

export function useDevSession(): DevSessionContextValue {
  const context = useContext(DevSessionContext);
  if (!context) {
    throw new Error("useDevSession debe usarse dentro de DevSessionProvider");
  }
  return context;
}

