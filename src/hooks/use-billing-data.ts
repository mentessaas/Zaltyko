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
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Fetch billing summary
      const summaryResponse = await fetch(`/api/billing/summary?academyId=${academyId}`, {
        credentials: "include",
      });
      if (summaryResponse.ok) {
        const summary = await summaryResponse.json();
        setBillingSummary(summary);
      }

      // Fetch plans
      const plansResponse = await fetch("/api/plans", {
        credentials: "include",
      });
      if (plansResponse.ok) {
        const plansData = await plansResponse.json();
        setPlans(plansData.plans || []);
      }

      // Fetch invoices
      const invoicesResponse = await fetch(`/api/billing/invoices?academyId=${academyId}`, {
        credentials: "include",
      });
      if (invoicesResponse.ok) {
        const invoicesData = await invoicesResponse.json();
        setInvoices(invoicesData.invoices || []);
      }
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

