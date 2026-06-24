"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";

type LinkRequest = {
  id: string;
  status: string;
  requestedProfileRole: string;
  requestedMembershipRole: string;
  message: string | null;
  academyId: string;
  academyName: string | null;
  createdAt: string | Date | null;
};

export function LinkRequestsPanel() {
  const toast = useToast();
  const [requests, setRequests] = useState<LinkRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyRequestId, setBusyRequestId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch("/api/link-requests?scope=incoming", {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.message ?? payload?.error ?? "No se pudieron cargar las solicitudes");
      }
      setRequests(payload?.data?.requests ?? []);
    } catch (error) {
      toast.pushToast({
        title: "No se pudieron cargar las solicitudes",
        description: error instanceof Error ? error.message : "Error inesperado.",
        variant: "error",
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  async function respond(requestId: string, action: "accept" | "reject") {
    setBusyRequestId(requestId);
    try {
      const response = await fetch(`/api/link-requests/${requestId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message ?? payload?.error ?? "No se pudo responder la solicitud");
      }

      toast.pushToast({
        title: action === "accept" ? "Vinculo aceptado" : "Solicitud rechazada",
        description:
          action === "accept"
            ? "Tu cuenta ya esta vinculada con la academia."
            : "La solicitud quedo rechazada.",
        variant: "success",
      });

      if (action === "accept" && payload?.data?.redirectUrl) {
        window.location.assign(payload.data.redirectUrl);
        return;
      }

      await loadRequests();
    } catch (error) {
      toast.pushToast({
        title: "No se pudo responder",
        description: error instanceof Error ? error.message : "Error inesperado.",
        variant: "error",
      });
    } finally {
      setBusyRequestId(null);
    }
  }

  const pendingRequests = requests.filter((request) => request.status === "pending");

  return (
    <section className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Solicitudes
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">
            Vinculos con academias
          </h2>
        </div>
        {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      <div className="mt-4 space-y-3">
        {!isLoading && pendingRequests.length === 0 && (
          <p className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            No tienes solicitudes pendientes.
          </p>
        )}

        {pendingRequests.map((request) => (
          <article
            key={request.id}
            className="rounded-lg border border-border bg-background p-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h3 className="font-medium text-foreground">
                  {request.academyName ?? "Academia"}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  Quiere vincular tu cuenta como {request.requestedProfileRole}.
                </p>
                {request.message && (
                  <p className="mt-2 rounded-md bg-muted/40 p-3 text-sm text-muted-foreground">
                    {request.message}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyRequestId === request.id}
                  onClick={() => void respond(request.id, "reject")}
                >
                  <X className="mr-1 h-4 w-4" />
                  Rechazar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={busyRequestId === request.id}
                  onClick={() => void respond(request.id, "accept")}
                >
                  {busyRequestId === request.id ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="mr-1 h-4 w-4" />
                  )}
                  Aceptar
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
