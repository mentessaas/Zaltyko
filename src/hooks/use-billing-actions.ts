import { useState } from "react";

import type { PlanCode } from "@/types/billing";

interface UseBillingActionsResult {
  triggerCheckout: (planCode: PlanCode) => Promise<void>;
  openPortal: () => Promise<void>;
  handleSync: () => Promise<void>;
  loadingAction: PlanCode | "portal" | "sync" | null;
  error: string | null;
}

/**
 * Hook para manejar acciones de billing (checkout, portal, sync)
 */
export function useBillingActions(
  academyId: string | null,
  userId: string | null,
  onSuccess?: () => void
): UseBillingActionsResult {
  const [loadingAction, setLoadingAction] = useState<PlanCode | "portal" | "sync" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const triggerCheckout = async (planCode: PlanCode) => {
    if (!academyId || !userId) {
      setError("Activa la sesión demo antes de realizar el checkout.");
      return;
    }

    setLoadingAction(planCode);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({ academyId, planCode }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? "No se pudo iniciar el checkout");
      }

      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Error desconocido";
      setError(errorMessage);
    } finally {
      setLoadingAction(null);
    }
  };

  const openPortal = async () => {
    if (!academyId || !userId) {
      setError("Activa la sesión demo antes de abrir el portal.");
      return;
    }

    setLoadingAction("portal");
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({ academyId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error ?? "No se pudo abrir el portal de Stripe");
      }

      if (data.portalUrl) {
        window.location.href = data.portalUrl;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Error desconocido";
      setError(errorMessage);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSync = async () => {
    if (!academyId || !userId) {
      setError("Activa la sesión demo antes de sincronizar.");
      return;
    }

    setLoadingAction("sync");
    setError(null);
    try {
      const res = await fetch("/api/billing/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": userId,
        },
        body: JSON.stringify({ academyId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.message || data?.error || "No se pudo sincronizar las facturas");
      }

      if (onSuccess) {
        onSuccess();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Error desconocido";
      setError(errorMessage);
    } finally {
      setLoadingAction(null);
    }
  };

  return {
    triggerCheckout,
    openPortal,
    handleSync,
    loadingAction,
    error,
  };
}

