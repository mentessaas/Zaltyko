import { useState, useEffect } from "react";

import type { PlanSummary, BillingSummary, InvoiceRow } from "@/types/billing";

interface UseBillingDataResult {
  billingSummary: BillingSummary | null;
  plans: PlanSummary[];
  invoices: InvoiceRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Hook para obtener datos de billing
 */
export function useBillingData(academyId: string | null): UseBillingDataResult {
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    if (!academyId) {
      setLoading(false);
      setBillingSummary(null);
      setPlans([]);
      setInvoices([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // These are the canonical tenant-scoped billing endpoints. Status and
      // history intentionally use POST because the academy context belongs in
      // the validated request body, not in an untrusted query-only read.
      const [summaryResponse, plansResponse, invoicesResponse] = await Promise.all([
        fetch("/api/billing/status", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ academyId }),
        }),
        fetch("/api/billing/plans", { credentials: "include" }),
        fetch("/api/billing/history", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ academyId, limit: 50 }),
        }),
      ]);

      const [summary, planRows, invoiceRows] = await Promise.all([
        readApiData<BillingSummary>(summaryResponse, "el estado de cobros"),
        readApiData<PlanSummary[]>(plansResponse, "los planes"),
        readApiData<InvoiceRow[]>(invoicesResponse, "el historial de recibos"),
      ]);

      setBillingSummary(summary);
      setPlans(planRows);
      setInvoices(invoiceRows);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Error al cargar datos de billing";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [academyId]);

  return {
    billingSummary,
    plans,
    invoices,
    loading,
    error,
    refresh: fetchData,
  };
}

async function readApiData<T>(response: Response, resourceLabel: string): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | { ok?: boolean; data?: T; message?: string; error?: string }
    | null;

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.message || `No se pudo cargar ${resourceLabel}`);
  }

  if (payload && payload.ok === true && "data" in payload) {
    return payload.data as T;
  }

  throw new Error(`La respuesta de ${resourceLabel} no es válida`);
}
