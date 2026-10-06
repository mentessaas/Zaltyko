"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowRight,
  BellRing,
  CheckCircle2,
  Clock3,
  Lightbulb,
  MapPin,
  MoreHorizontal,
  ShieldCheck,
  Target,
} from "lucide-react";

import type {
  InsightListBundle,
  InsightListItem,
} from "@/modules/insights/application/insight-query";
import {
  calculateGroupSimulation,
} from "@/modules/insights/domain/group-simulation";

const statusLabels: Record<string, string> = {
  open: "Nuevo",
  viewed: "Revisado",
  actioned: "En marcha",
  snoozed: "Pospuesto",
  dismissed: "Descartado",
  resolved: "Resuelto",
};

const severityLabels: Record<string, string> = {
  critical: "Crítico",
  high: "Alta prioridad",
  medium: "Prioridad media",
  low: "Prioridad baja",
};

const actionLabels: Record<string, string> = {
  simulate_group: "Simular nuevo grupo",
  review_collections: "Revisar cobros",
  review_attendance: "Revisar asistencia",
  contact_waitlist: "Contactar lista de espera",
  review_retention: "Revisar continuidad",
};

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Madrid",
  }).format(new Date(value));
}

function formatEstimate(item: InsightListItem): string | null {
  if (
    item.estimatedValueMinMinor === null ||
    item.estimatedValueMaxMinor === null
  ) {
    return null;
  }
  const currency = item.estimateCurrency ?? "EUR";
  const format = new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
  return `${format.format(item.estimatedValueMinMinor / 100)}–${format.format(item.estimatedValueMaxMinor / 100)}`;
}

function Evidence({ evidence }: { evidence: Record<string, unknown> }) {
  const entries = Object.entries(evidence).slice(0, 6);
  return (
    <dl className="grid grid-cols-2 gap-px border border-slate-300 bg-slate-300 sm:grid-cols-3">
      {entries.map(([key, value]) => (
        <div key={key} className="bg-[#F8F8F4] p-3">
          <dt className="break-words text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600">
            {key.replaceAll("_", " ")}
          </dt>
          <dd className="mt-1 break-words font-mono text-sm font-semibold text-slate-950">
            {typeof value === "number"
              ? new Intl.NumberFormat("es-ES", {
                  maximumFractionDigits: 2,
                }).format(value)
              : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function InsightCard({
  item,
  bundle,
}: {
  item: InsightListItem;
  bundle: InsightListBundle;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState("");
  const [simulationOpen, setSimulationOpen] = useState(false);
  const [proposedCapacity, setProposedCapacity] = useState("");
  const [monthlyPrice, setMonthlyPrice] = useState("");
  const estimate = formatEstimate(item);
  const isGroupSimulation = item.ctaKey === "simulate_group";
  const eligibleDemand = Number(item.evidence.eligibleWaitlist);
  const capacityValue = Number(proposedCapacity);
  const priceValue = monthlyPrice.trim() ? Number(monthlyPrice) : undefined;
  const validSimulation =
    Number.isInteger(eligibleDemand) &&
    eligibleDemand >= 0 &&
    Number.isInteger(capacityValue) &&
    capacityValue >= 1 &&
    capacityValue <= 100 &&
    (priceValue === undefined ||
      (Number.isFinite(priceValue) && priceValue >= 0 && priceValue <= 100000));
  const simulation = validSimulation
    ? calculateGroupSimulation({
        eligibleDemand,
        proposedCapacity: capacityValue,
        monthlyPriceMinor:
          priceValue === undefined ? undefined : Math.round(priceValue * 100),
      })
    : [];

  const basePayload = {
    organizationId: bundle.organization.id,
    locationId: bundle.scope.locationId ?? undefined,
    expectedVersion: item.version,
  };

  async function mutate(
    intent: "action" | "snooze" | "dismiss",
    path: string,
    payload: Record<string, unknown>
  ) {
    setPending(intent);
    setError(null);
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as {
          detail?: string;
        } | null;
        throw new Error(
          problem?.detail ?? "No se ha podido guardar el cambio."
        );
      }
      router.refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se ha podido guardar el cambio."
      );
    } finally {
      setPending(null);
    }
  }

  return (
    <article
      id={`insight-${item.id}`}
      className="scroll-mt-6 border-t-4 border-teal-800 bg-white p-5 shadow-soft sm:p-7"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-[0.12em]">
          <span className="bg-slate-950 px-2.5 py-1.5 text-white">
            {Math.round(item.priorityScore)} / 100
          </span>
          <span className="text-[#A33A2D]">
            {severityLabels[item.severity] ?? item.severity}
          </span>
          <span className="text-slate-600">
            {statusLabels[item.status] ?? item.status}
          </span>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
          {formatTimestamp(item.lastSeenAt)}
        </span>
      </div>

      <h2 className="mt-5 text-2xl tracking-[-0.03em] text-slate-950 sm:text-3xl">
        {item.title}
      </h2>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">
        {item.detail}
      </p>

      {estimate && (
        <div className="mt-5 border-l-4 border-zaltyko-coral bg-[#FFF8F2] p-4">
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#A33A2D]">
            Hipótesis de valor, no garantía
          </p>
          <p className="mt-1 font-mono text-2xl font-semibold text-slate-950">
            {estimate}
          </p>
        </div>
      )}

      <details className="group mt-5 border-y border-slate-300">
        <summary className="touch-target flex cursor-pointer list-none items-center gap-3 py-3 font-semibold marker:hidden">
          <ShieldCheck className="h-4 w-4 text-teal-800" aria-hidden="true" />
          <span className="min-w-0 flex-1">Evidencia y supuestos</span>
          <MoreHorizontal
            className="h-5 w-5 text-slate-600"
            aria-hidden="true"
          />
        </summary>
        <div className="pb-5">
          <Evidence evidence={item.evidence} />
          {item.assumptions.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.14em] text-slate-600">
                Supuestos declarados
              </h3>
              <ul className="mt-2 space-y-2 text-sm leading-5 text-slate-600">
                {item.assumptions.map((assumption, index) => (
                  <li key={index} className="flex gap-2">
                    <span aria-hidden="true">—</span>
                    <span>{String(assumption)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-4 text-xs text-slate-600">
            Regla {item.ruleKey} · v{item.ruleVersion}
          </p>
        </div>
      </details>

      {error && (
        <p
          role="alert"
          className="mt-4 border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          {error}
        </p>
      )}

      {isGroupSimulation && simulationOpen && (
        <section
          aria-label="Simulación hipotética de un nuevo grupo"
          className="mt-5 border border-teal-800 bg-[#F3F8F5] p-4 sm:p-6"
        >
          <h3 className="text-xl font-semibold">Prueba una hipótesis</h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">
            La demanda contactable viene de la evidencia de este insight. Define
            tú la capacidad y, si quieres, un precio mensual hipotético. Los
            porcentajes son escenarios de sensibilidad, no una conversión
            observada ni un benchmark.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-slate-800">
              Plazas del grupo hipotético
              <input
                aria-label="Plazas del grupo hipotético"
                type="number"
                min={1}
                max={100}
                step={1}
                inputMode="numeric"
                value={proposedCapacity}
                onChange={(event) => setProposedCapacity(event.target.value)}
                className="min-h-11 border border-slate-400 bg-white px-3 text-base"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-slate-800">
              Precio mensual hipotético por plaza (opcional, {bundle.organization.defaultCurrency})
              <input
                aria-label={`Precio mensual hipotético por plaza en ${bundle.organization.defaultCurrency}`}
                type="number"
                min={0}
                max={100000}
                step="0.01"
                inputMode="decimal"
                value={monthlyPrice}
                onChange={(event) => setMonthlyPrice(event.target.value)}
                className="min-h-11 border border-slate-400 bg-white px-3 text-base"
              />
            </label>
          </div>
          {validSimulation ? (
            <>
              <p className="mt-4 text-sm font-semibold text-slate-800">
                Demanda contactable observada: {eligibleDemand} · plazas
                hipotéticas vendibles: {Math.min(eligibleDemand, capacityValue)}
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3">
                {simulation.map((scenario) => (
                  <div key={scenario.key} className="border border-slate-300 bg-white p-3">
                    <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-600">
                      {scenario.label} · {Math.round(scenario.conversionRate * 100)}%
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      {scenario.estimatedEnrollments} altas hipotéticas
                    </p>
                    {scenario.grossMonthlyMinor !== null && (
                      <p className="font-mono text-sm text-slate-700">
                        {new Intl.NumberFormat("es-ES", {
                          style: "currency",
                          currency: bundle.organization.defaultCurrency,
                        }).format(scenario.grossMonthlyMinor / 100)} / mes bruto
                      </p>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-slate-600">
                Estimación hipotética, no compromiso de altas ni ingreso. No
                descuenta impagos, descuentos, impuestos o costes. Ejecutar esta
                simulación no crea grupo, clase, plazas ni comunicaciones.
              </p>
            </>
          ) : (
            <p className="mt-4 text-sm text-slate-700">
              Introduce una capacidad de 1 a 100 plazas para ver los escenarios.
              El precio, si lo añades, debe estar entre 0 y 100.000 por mes.
            </p>
          )}
        </section>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
        <button
          type="button"
          disabled={pending !== null || item.status === "actioned"}
          onClick={() => {
            if (isGroupSimulation) {
              setSimulationOpen((open) => !open);
              return;
            }
            void mutate("action", `/api/v1/insights/${item.id}/actions`, {
              ...basePayload,
              actionKey: item.ctaKey,
              targetEntityType: item.entityType,
              targetEntityId: item.entityId ?? undefined,
              beforeValue: item.evidence,
              evaluationWindowDays: 30,
            });
          }}
          className="touch-target inline-flex items-center justify-center gap-2 bg-teal-800 px-5 py-3 text-sm font-bold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:bg-slate-400"
        >
          {item.status === "actioned"
            ? "Acción registrada"
            : isGroupSimulation
              ? simulationOpen
                ? "Cerrar simulador"
                : "Simular nuevo grupo"
              : pending === "action"
              ? "Guardando…"
              : (actionLabels[item.ctaKey] ?? "Empezar acción")}
          {item.status === "actioned" ? (
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          ) : (
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
        {isGroupSimulation && simulationOpen && (
          <button
            type="button"
            disabled={pending !== null || item.status === "actioned" || !validSimulation}
            onClick={() =>
              mutate("action", `/api/v1/insights/${item.id}/actions`, {
                ...basePayload,
                actionKey: item.ctaKey,
                targetEntityType: item.entityType,
                targetEntityId: item.entityId ?? undefined,
                beforeValue: {
                  simulationInput: {
                    proposedCapacity: capacityValue,
                    monthlyPriceMinor:
                      priceValue === undefined ? null : Math.round(priceValue * 100),
                  },
                },
                evaluationWindowDays: 30,
              })
            }
            className="touch-target border border-teal-800 px-5 py-3 text-sm font-bold text-teal-900 hover:bg-teal-50 disabled:cursor-not-allowed disabled:text-slate-400"
          >
            {pending === "action" ? "Guardando…" : "Guardar simulación y seguimiento"}
          </button>
        )}
        <button
          type="button"
          disabled={pending !== null || item.status === "actioned"}
          onClick={() => {
            const tomorrow = new Date();
            tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
            void mutate("snooze", `/api/v1/insights/${item.id}/snooze`, {
              ...basePayload,
              snoozedUntil: tomorrow.toISOString(),
            });
          }}
          className="touch-target border border-slate-400 bg-white px-5 py-3 text-sm font-bold text-slate-950 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
        >
          {pending === "snooze" ? "Guardando…" : "Recordar mañana"}
        </button>
      </div>

      {item.status !== "actioned" && (
        <details className="mt-4 text-sm">
          <summary className="touch-target cursor-pointer py-2 font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4">
            No es relevante
          </summary>
          <div className="grid gap-3 border-l-2 border-slate-300 pl-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="grid gap-2 font-semibold text-slate-700">
              Motivo del descarte
              <textarea
                value={dismissReason}
                onChange={(event) => setDismissReason(event.target.value)}
                minLength={3}
                maxLength={300}
                rows={2}
                className="border border-slate-400 bg-white p-3 font-normal text-slate-950"
              />
            </label>
            <button
              type="button"
              disabled={pending !== null || dismissReason.trim().length < 3}
              onClick={() =>
                mutate("dismiss", `/api/v1/insights/${item.id}/dismiss`, {
                  ...basePayload,
                  reason: dismissReason,
                })
              }
              className="touch-target border border-slate-400 px-4 py-3 font-bold text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-400"
            >
              {pending === "dismiss" ? "Descartando…" : "Descartar"}
            </button>
          </div>
        </details>
      )}
    </article>
  );
}

export function InsightInbox({ bundle }: { bundle: InsightListBundle }) {
  const filterBase = new URLSearchParams({
    organizationId: bundle.organization.id,
  });
  if (bundle.scope.locationId) {
    filterBase.set("locationId", bundle.scope.locationId);
  }
  if (bundle.scope.entityId) {
    filterBase.set("entityId", bundle.scope.entityId);
  }

  return (
    <div className="min-h-screen bg-[#F1F3EF] text-slate-950">
      <a
        href="#contenido"
        className="fixed left-4 top-3 z-50 -translate-y-24 bg-slate-950 px-4 py-3 text-sm font-bold text-white transition-transform focus:translate-y-0"
      >
        Saltar al contenido
      </a>
      <header className="border-b border-slate-300/80 bg-[#F8F8F4]">
        <div className="mx-auto flex max-w-[92rem] items-center justify-between gap-4 px-5 py-4 lg:px-10">
          <Link
            href="/owner"
            className="touch-target inline-flex items-center gap-3 text-slate-950"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-teal-800 font-display text-sm font-bold text-white">
              Z
            </span>
            <span>
              <span className="block font-display text-base font-bold leading-none">
                Zaltyko
              </span>
              <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-slate-600">
                Mesa de dirección
              </span>
            </span>
          </Link>
          <nav aria-label="Principal" className="flex items-center gap-1">
            <Link
              href="/owner"
              className="touch-target hidden items-center px-4 text-sm font-semibold text-slate-600 hover:text-slate-950 sm:inline-flex"
            >
              Resumen
            </Link>
            <Link
              href="/owner/insights"
              aria-current="page"
              className="touch-target inline-flex items-center bg-slate-950 px-4 text-sm font-semibold text-white"
            >
              Insights
            </Link>
          </nav>
        </div>
      </header>

      <main
        id="contenido"
        className="mx-auto max-w-[92rem] px-5 pb-24 pt-7 lg:px-10 lg:pb-16 lg:pt-10"
      >
        <section className="border-b border-slate-400 pb-7">
          <div className="grid gap-7 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-teal-800">
                <BellRing className="h-4 w-4" aria-hidden="true" />
                Decisiones activas
              </p>
              <h1 className="mt-2 max-w-4xl text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
                Qué merece atención ahora
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                Evidencia, supuestos y siguiente acción en un mismo sitio. Cada
                cambio queda versionado y cada resultado puede medirse.
              </p>
            </div>
            <form
              method="get"
              className="grid gap-3 sm:grid-cols-[minmax(13rem,1fr)_auto] sm:items-end"
              aria-label="Filtrar insights por sede"
            >
              <input
                type="hidden"
                name="organizationId"
                value={bundle.organization.id}
              />
              {bundle.scope.entityId && (
                <input
                  type="hidden"
                  name="entityId"
                  value={bundle.scope.entityId}
                />
              )}
              <label className="grid gap-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-600">
                Ámbito
                <select
                  name="locationId"
                  defaultValue={bundle.scope.locationId ?? ""}
                  className="touch-target border border-slate-400 bg-white px-3 text-sm font-semibold text-slate-950"
                >
                  {bundle.scope.canViewOrganizationAggregate && (
                    <option value="">Toda la academia</option>
                  )}
                  {bundle.scope.locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
              <button className="touch-target bg-slate-950 px-5 text-sm font-bold text-white">
                Aplicar
              </button>
            </form>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <Target className="h-4 w-4" aria-hidden="true" />
              {bundle.items.length} prioridades visibles
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              {bundle.scope.locationId
                ? bundle.scope.locations.find(
                    (location) => location.id === bundle.scope.locationId
                  )?.name
              : "Toda la academia"}
            </span>
            {bundle.scope.entityId && (
              <span className="inline-flex items-center gap-2">
                Oportunidades de la entidad seleccionada
                <Link
                  href={`/owner/insights?${new URLSearchParams({
                    organizationId: bundle.organization.id,
                    ...(bundle.scope.locationId
                      ? { locationId: bundle.scope.locationId }
                      : {}),
                  }).toString()}`}
                  className="touch-target underline underline-offset-2"
                >
                  Quitar filtro
                </Link>
              </span>
            )}
          </div>
        </section>

        {bundle.items.length === 0 ? (
          <section className="mt-8 border-l-4 border-teal-800 bg-white p-7 shadow-soft sm:p-10">
            <Lightbulb className="h-7 w-7 text-teal-800" aria-hidden="true" />
            <h2 className="mt-4 text-3xl">No hay decisiones pendientes</h2>
            <p className="mt-3 max-w-xl leading-6 text-slate-600">
              El motor no ha encontrado una condición accionable en este ámbito.
              Esto no sustituye la revisión de cobertura y calidad de datos del
              cierre.
            </p>
            <Link
              href="/owner"
              className="touch-target mt-6 inline-flex items-center gap-2 bg-slate-950 px-5 py-3 text-sm font-bold text-white"
            >
              Volver al resumen
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </section>
        ) : (
          <section aria-label="Lista de insights" className="mt-8 grid gap-6">
            {bundle.items.map((item) => (
              <InsightCard key={item.id} item={item} bundle={bundle} />
            ))}
          </section>
        )}

        {bundle.nextCursor && (
          <div className="mt-8 text-center">
            <Link
              href={`/owner/insights?${new URLSearchParams({ ...Object.fromEntries(filterBase), cursor: bundle.nextCursor }).toString()}`}
              className="touch-target inline-flex items-center border border-slate-400 bg-white px-5 py-3 text-sm font-bold text-slate-950"
            >
              Ver siguientes prioridades
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
