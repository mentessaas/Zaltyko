"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

import { useDevSession } from "@/components/dev-session-provider";
import { createClient } from "@/lib/supabase/client";
import { BillingSummary } from "@/components/billing/BillingSummary";
import { PlanSelector } from "@/components/billing/PlanSelector";
import { InvoiceList } from "@/components/billing/InvoiceList";
import { useBillingActions } from "@/hooks/use-billing-actions";
import type { PlanCode, BillingSummary as BillingSummaryType, PlanSummary, InvoiceRow } from "@/types/billing";
import { logger } from "@/lib/logger";

export default function BillingPage() {
  const searchParams = useSearchParams();
  const { session: devSession, loading: loadingSession, refresh } = useDevSession();
  const [userSession, setUserSession] = useState<{ userId: string; academyId: string | null } | null>(null);
  const [loadingUserSession, setLoadingUserSession] = useState(true);

  // Obtener sesión del usuario autenticado si no hay sesión demo
  useEffect(() => {
    const loadUserSession = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          const response = await fetch("/api/billing/user-academies", {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          });
          
          if (response.ok) {
            const data = await response.json();
            setUserSession({
              userId: user.id,
              academyId: data.academyId || null,
            });
          } else {
            setUserSession({
              userId: user.id,
              academyId: null,
            });
          }
        }
      } catch (error) {
        logger.error("Error loading user session", error);
      } finally {
        setLoadingUserSession(false);
      }
    };

    if (!devSession && !loadingSession) {
      loadUserSession();
    } else {
      setLoadingUserSession(false);
    }
  }, [devSession, loadingSession]);

  const session = devSession 
    ? { userId: devSession.userId, academyId: devSession.academyId, academyName: devSession.academyName }
    : userSession 
    ? { userId: userSession.userId, academyId: userSession.academyId, academyName: undefined }
    : null;

  const academyId = useMemo(() => {
    const fromUrl = searchParams.get("academy");
    if (fromUrl) return fromUrl;
    return session?.academyId ?? null;
  }, [searchParams, session?.academyId]);

  const [summary, setSummary] = useState<BillingSummaryType | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [history, setHistory] = useState<InvoiceRow[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Hook para acciones de billing
  const { triggerCheckout, openPortal, handleSync, loadingAction, error: actionError } = useBillingActions(
    academyId,
    session?.userId ?? null,
    () => {
      // Recargar historial después de sincronizar
      if (academyId && session?.userId) {
        loadHistory();
      }
    }
  );

  const loadSummary = async () => {
    if (!academyId || !session?.userId) {
      setSummary(null);
      setLoadingSummary(false);
      return;
    }

    if (loadingSession || loadingUserSession) {
      return;
    }

    setLoadingSummary(true);
    try {
      const res = await fetch("/api/billing/status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": session.userId,
        },
        body: JSON.stringify({ academyId }),
      });

      if (!res.ok) {
        throw new Error("No se pudo obtener la información de facturación");
      }

      const data = (await res.json()) as BillingSummaryType;
      setSummary(data);
    } catch (err) {
      logger.error("Error loading billing summary", err);
    } finally {
      setLoadingSummary(false);
    }
  };

  const loadPlans = async () => {
    if (!session?.userId) {
      setPlans([]);
      setLoadingPlans(false);
      return;
    }

    setLoadingPlans(true);
    try {
      const res = await fetch("/api/billing/plans", {
        method: "GET",
        headers: {
          "x-user-id": session.userId,
        },
      });

      if (!res.ok) {
        throw new Error("No se pudieron obtener los planes");
      }

      const data = (await res.json()) as PlanSummary[];
      setPlans(data);
    } catch (err) {
      logger.error("Error loading plans", err);
      setPlans([]);
    } finally {
      setLoadingPlans(false);
    }
  };

  const loadHistory = async () => {
    if (!academyId || !session?.userId) {
      setHistory([]);
      return;
    }

    setLoadingHistory(true);
    try {
      const res = await fetch("/api/billing/history", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-user-id": session.userId,
        },
        body: JSON.stringify({ academyId }),
      });

      if (!res.ok) {
        throw new Error("No se pudo obtener el historial de facturación");
      }

      const data = (await res.json()) as InvoiceRow[];
      setHistory(data);
    } catch (err) {
      logger.error("Error loading history", err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    loadSummary();
  }, [academyId, session?.userId, loadingSession, loadingUserSession]);

  useEffect(() => {
    loadPlans();
  }, [session?.userId]);

  useEffect(() => {
    loadHistory();
  }, [academyId, session?.userId]);

  const currentPlanInfo = summary
    ? plans.find((plan) => plan.code === summary.planCode) ?? null
    : null;

  const isOpeningPortal = loadingAction === "portal";
  const isSyncing = loadingAction === "sync";
  const checkoutLoadingAction = typeof loadingAction === "string" && loadingAction !== "portal" && loadingAction !== "sync" 
    ? (loadingAction as PlanCode)
    : null;

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Facturación y planes</h1>
        <p className="text-muted-foreground">
          Escala tu academia de gimnasia y gestiona pagos desde un único lugar.
        </p>
      </header>

      {!academyId && !loadingSession && !loadingUserSession && (
        <p className="rounded border border-amber-400/60 bg-amber-400/10 p-3 text-sm text-amber-200">
          {session 
            ? "No tienes academias asociadas. Crea una academia desde el dashboard."
            : "Inicia el onboarding o refresca la sesión demo para obtener una academia asociada."}
        </p>
      )}

      {actionError && (
        <p className="rounded border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {actionError}
        </p>
      )}

      <BillingSummary
        summary={summary}
        currentPlan={currentPlanInfo}
        loading={loadingSession || loadingUserSession || loadingSummary}
        onOpenPortal={openPortal}
        isOpeningPortal={isOpeningPortal}
      />

      <PlanSelector
        plans={plans}
        currentSummary={summary}
        loading={loadingPlans}
        onSelectPlan={triggerCheckout}
        loadingAction={checkoutLoadingAction}
        disabled={!academyId || !session?.userId}
      />

      <InvoiceList
        invoices={history}
        loading={loadingHistory}
        onSync={handleSync}
        isSyncing={isSyncing}
        disabled={!academyId || !session?.userId}
      />

      <div className="rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-slate-200/80">
        <p>
          Academia activa: <strong>{session?.academyName ?? "Demo"}</strong> · ID:
          <code className="ml-2 rounded bg-black/40 px-2 py-1 text-xs">
            {academyId ?? "sin asignar"}
          </code>
        </p>
        <button
          className="mt-3 inline-flex items-center justify-center rounded-full border border-white/20 px-3 py-1 text-xs font-semibold text-white hover:bg-white/10"
          onClick={refresh}
          type="button"
        >
          Refrescar sesión demo
        </button>
      </div>
    </div>
  );
}
