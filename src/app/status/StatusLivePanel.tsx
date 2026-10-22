"use client";

import { useEffect, useState } from "react";

type CheckStatus = "checking" | "operational" | "configured" | "attention" | "unavailable";

type HealthPayload = {
  status?: "ok" | "degraded";
  checks?: {
    database?: { status?: "ok" | "failed" };
    cronAuth?: { status?: "ok" | "missing" };
  };
  timestamp?: string;
};

type ServiceCard = {
  name: string;
  description: string;
  status: CheckStatus;
};

const statusLabel: Record<CheckStatus, string> = {
  checking: "Comprobando…",
  operational: "Operativo",
  configured: "Configurado",
  attention: "Requiere atención",
  unavailable: "No disponible",
};

const statusClasses: Record<CheckStatus, string> = {
  checking: "text-muted-foreground",
  operational: "text-emerald-700",
  configured: "text-emerald-700",
  attention: "text-amber-800",
  unavailable: "text-red-700",
};

function getCards(status: CheckStatus, payload: HealthPayload | null): ServiceCard[] {
  const databaseStatus = payload?.checks?.database?.status;
  const cronStatus = payload?.checks?.cronAuth?.status;

  return [
    {
      name: "API",
      description: "Respuesta pública de Zaltyko",
      status,
    },
    {
      name: "Base de datos",
      description: "Conectividad y lectura básica",
      status:
        status === "checking"
          ? "checking"
          : databaseStatus === "ok"
            ? "operational"
            : "unavailable",
    },
    {
      name: "Automatizaciones",
      description: "Autenticación configurada para tareas programadas",
      status:
        status === "checking"
          ? "checking"
          : cronStatus === "ok"
            ? "configured"
            : "attention",
    },
  ];
}

export default function StatusLivePanel() {
  const [status, setStatus] = useState<CheckStatus>("checking");
  const [payload, setPayload] = useState<HealthPayload | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    fetch("/api/health", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          | { data?: HealthPayload }
          | null;
        const health = body?.data ?? null;
        setPayload(health);
        setStatus(response.ok && health?.status === "ok" ? "operational" : "attention");
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setStatus("unavailable");
          setPayload(null);
        }
      });

    return () => controller.abort();
  }, []);

  const cards = getCards(status, payload);
  const checkedAt = payload?.timestamp
    ? new Intl.DateTimeFormat("es-ES", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(payload.timestamp)
      )
    : null;

  return (
    <div className="mt-8">
      <div className="grid gap-3 sm:grid-cols-3" role="region" aria-label="Estado de los servicios">
        {cards.map((card) => (
          <div key={card.name} className="rounded-lg border bg-card px-5 py-4 text-left">
            <p className="text-sm font-semibold text-foreground">{card.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{card.description}</p>
            <p className={`mt-3 text-xs font-semibold ${statusClasses[card.status]}`} aria-live="polite">
              {statusLabel[card.status]}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-4 text-center text-xs text-muted-foreground" aria-live="polite">
        {checkedAt ? `Última comprobación: ${checkedAt}` : "Comprobación en curso…"}
      </p>
    </div>
  );
}
