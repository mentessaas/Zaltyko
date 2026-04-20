"use client";

import { useState, useEffect, useCallback } from "react";

interface ReportOptions {
  params?: Record<string, string>;
  dependencies?: any[];
  onSuccess?: (data: any) => void;
  onError?: (error: string) => void;
}

interface UseReportDataResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useReportData<T>(
  endpoint: string,
  options?: ReportOptions
): UseReportDataResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { params = {}, dependencies = [], onSuccess, onError } = options || {};

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams(params);
      const response = await fetch(`${endpoint}?${queryParams}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || result.error || "Error al cargar datos");
      }

      setData(result.data);
      onSuccess?.(result.data);
    } catch (err: any) {
      const errorMessage = err.message || "Error al cargar datos";
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [endpoint, JSON.stringify(params), onSuccess, onError]);

  useEffect(() => {
    refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  return { data, loading, error, refetch };
}
