/**
 * Hook genérico para fetching de datos con cache y auto-refresh
 */

import { useState, useEffect, useCallback, useRef } from "react";

export interface FetchState<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
}

export interface UseFetchOptions<T> {
  /** URL para fetch */
  url: string;
  /** Intervalo de auto-refresh en ms (0 = disabled) */
  refreshInterval?: number;
  /** Dependencias adicionales */
  deps?: unknown[];
  /** Función para transformar la respuesta */
  transform?: (data: unknown) => T;
  /** Si es true, no hace fetch inicial */
  manual?: boolean;
}

export interface UseFetchReturn<T> extends FetchState<T> {
  /** Función para recargar datos */
  refetch: () => Promise<void>;
  /** Función para actualizar datos manualmente */
  setData: (data: T) => void;
}

/**
 * Hook genérico para fetching de datos
 * Encapsula el patrón común: useState + useEffect + fetch
 */
export function useFetchData<T = unknown>({
  url,
  refreshInterval = 0,
  deps = [],
  transform,
  manual = false,
}: UseFetchOptions<T>): UseFetchReturn<T> {
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    loading: !manual,
    error: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const fetchData = useCallback(async () => {
    // Cancelar request anterior si existe
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();

    setState((prev) => ({ ...prev, loading: true, error: null }));

    try {
      const response = await fetch(url, {
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const rawData = await response.json();
      const data = transform ? transform(rawData) : rawData;

      if (mountedRef.current) {
        setState({ data, loading: false, error: null });
      }
    } catch (error) {
      if (mountedRef.current && error instanceof Error && error.name !== "AbortError") {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: error as Error,
        }));
      }
    }
  }, [url, transform]);

  useEffect(() => {
    mountedRef.current = true;

    if (!manual) {
      fetchData();
    }

    // Auto-refresh
    if (refreshInterval > 0) {
      const intervalId = setInterval(fetchData, refreshInterval);
      return () => {
        mountedRef.current = false;
        clearInterval(intervalId);
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
      };
    }

    return () => {
      mountedRef.current = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [url, refreshInterval, manual, ...deps]);

  const refetch = useCallback(async () => {
    await fetchData();
  }, [fetchData]);

  const setData = useCallback((data: T) => {
    setState({ data, loading: false, error: null });
  }, []);

  return {
    ...state,
    refetch,
    setData,
  };
}

/**
 * Hook para datos con cache en memoria
 */
export function useCachedData<T>(
  key: string,
  fetcher: () => Promise<T>,
  deps: unknown[] = []
): UseFetchReturn<T> {
  const cacheRef = useRef<Map<string, { data: T; timestamp: number }>>(new Map());
  const CACHE_TTL = 60000; // 1 minuto por defecto

  const [state, setState] = useState<FetchState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  const fetchWithCache = useCallback(async () => {
    const cached = cacheRef.current.get(key);
    const now = Date.now();

    if (cached && now - cached.timestamp < CACHE_TTL) {
      setState({ data: cached.data, loading: false, error: null });
      return;
    }

    setState((prev) => ({ ...prev, loading: true }));

    try {
      const data = await fetcher();
      cacheRef.current.set(key, { data, timestamp: Date.now() });
      setState({ data, loading: false, error: null });
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error as Error,
      }));
    }
  }, [key, fetcher]);

  useEffect(() => {
    fetchWithCache();
  }, [fetchWithCache, ...deps]);

  const refetch = useCallback(async () => {
    cacheRef.current.delete(key);
    await fetchWithCache();
  }, [key, fetchWithCache]);

  const setData = useCallback((data: T) => {
    cacheRef.current.set(key, { data, timestamp: Date.now() });
    setState({ data, loading: false, error: null });
  }, [key]);

  return {
    ...state,
    refetch,
    setData,
  };
}
