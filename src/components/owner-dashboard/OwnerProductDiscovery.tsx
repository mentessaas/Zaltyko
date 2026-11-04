"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const FEATURE_IDS = [
  "club-events",
  "club-acquisition",
  "sport-progression",
] as const;

type FeatureId = (typeof FEATURE_IDS)[number];
type FeatureIntent = { id: string; label: string };
type Interest = { intent: string | null; pilot: boolean };
type ProductFeature = {
  id: FeatureId;
  title: string;
  summary: string;
  status: "planned";
  statusLabel: string;
  intents: FeatureIntent[];
  interest: Interest;
};
type ProductDiscoveryResponse = {
  ok: true;
  data: { features: ProductFeature[]; measurementAvailable: boolean };
};
type SignalAction = "exposure" | "open" | "interest" | "withdraw";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseProductDiscoveryResponse(
  value: unknown
): ProductDiscoveryResponse | null {
  if (!isRecord(value) || value.ok !== true || !isRecord(value.data)) {
    return null;
  }

  const rawFeatures = value.data.features;
  if (
    !Array.isArray(rawFeatures) ||
    typeof value.data.measurementAvailable !== "boolean"
  ) {
    return null;
  }

  const features = rawFeatures.filter((item): item is ProductFeature => {
    if (!isRecord(item) || !FEATURE_IDS.includes(item.id as FeatureId)) {
      return false;
    }
    if (
      typeof item.title !== "string" ||
      typeof item.summary !== "string" ||
      item.status !== "planned" ||
      typeof item.statusLabel !== "string" ||
      !Array.isArray(item.intents) ||
      !isRecord(item.interest) ||
      (item.interest.intent !== null &&
        typeof item.interest.intent !== "string") ||
      typeof item.interest.pilot !== "boolean"
    ) {
      return false;
    }

    return item.intents.every(
      (intent) =>
        isRecord(intent) &&
        typeof intent.id === "string" &&
        typeof intent.label === "string"
    );
  });

  return {
    ok: true,
    data: {
      features: features.slice(0, 3),
      measurementAvailable: value.data.measurementAvailable,
    },
  };
}

function getEndpoint(organizationId: string, locationId?: string) {
  const query = new URLSearchParams({ organizationId });
  if (locationId) query.set("locationId", locationId);
  return "/api/v1/owner/product-discovery?" + query.toString();
}

export function OwnerProductDiscovery({
  organizationId,
  locationId,
  role,
}: {
  organizationId: string;
  locationId?: string | null;
  role?: string;
}) {
  const endpoint = useMemo(
    () => getEndpoint(organizationId, locationId ?? undefined),
    [organizationId, locationId]
  );
  const [features, setFeatures] = useState<ProductFeature[] | null>(null);
  const [measurementAvailable, setMeasurementAvailable] = useState<
    boolean | null
  >(null);
  const [expandedFeatureId, setExpandedFeatureId] = useState<string | null>(
    null
  );
  const [selectedIntents, setSelectedIntents] = useState<
    Record<string, string>
  >({});
  const [pilotSelections, setPilotSelections] = useState<
    Record<string, boolean>
  >({});
  const [pendingFeatureId, setPendingFeatureId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [signalError, setSignalError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const exposedKeys = useRef(new Set<string>());
  const listRef = useRef<HTMLElement | null>(null);
  const scopeRevision = useRef(0);
  const activeControllers = useRef(new Set<AbortController>());

  const sendSignal = useCallback(
    async (
      url: string,
      featureId: FeatureId,
      action: SignalAction,
      options?: { intent?: string; pilot?: boolean }
    ) => {
      if (!measurementAvailable) return null;
      const revision = scopeRevision.current;
      const controller = new AbortController();
      activeControllers.current.add(controller);
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ featureId, action, ...options }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("signal_failed");

        const result = parseProductDiscoveryResponse(await response.json());
        if (!result) throw new Error("signal_invalid");
        if (revision !== scopeRevision.current) return null;
        return result.data;
      } finally {
        activeControllers.current.delete(controller);
      }
    },
    [measurementAvailable]
  );

  useEffect(() => {
    const revision = scopeRevision.current + 1;
    scopeRevision.current = revision;
    const controller = new AbortController();
    activeControllers.current.add(controller);
    setLoading(true);
    setLoadError(null);
    setFeatures(null);
    setMeasurementAvailable(null);
    setExpandedFeatureId(null);
    setSelectedIntents({});
    setPilotSelections({});
    setPendingFeatureId(null);
    setSignalError(null);

    void fetch(endpoint, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("catalog_unavailable");
        return parseProductDiscoveryResponse(await response.json());
      })
      .then((result) => {
        if (!result) throw new Error("catalog_invalid");
        if (revision !== scopeRevision.current) return;
        setFeatures(result.data.features);
        setMeasurementAvailable(result.data.measurementAvailable);
        setLoading(false);
      })
      .catch(() => {
        if (controller.signal.aborted || revision !== scopeRevision.current)
          return;
        setLoadError("No pudimos cargar las propuestas. Inténtalo de nuevo.");
        setLoading(false);
      })
      .finally(() => {
        activeControllers.current.delete(controller);
      });

    return () => {
      scopeRevision.current += 1;
      controller.abort();
      for (const activeController of activeControllers.current) {
        activeController.abort();
      }
      activeControllers.current.clear();
    };
  }, [endpoint, loadAttempt]);

  useEffect(() => {
    const list = listRef.current;
    if (!features || !list || measurementAvailable !== true) return;

    const recordExposure = (featureId: FeatureId) => {
      const key = endpoint + ":" + featureId;
      if (exposedKeys.current.has(key)) return;
      exposedKeys.current.add(key);
      void sendSignal(endpoint, featureId, "exposure")
        .then((data) => {
          if (data) setMeasurementAvailable(data.measurementAvailable);
        })
        .catch(() => undefined);
    };

    const cards = Array.from(
      list.querySelectorAll<HTMLElement>("[data-discovery-feature-id]")
    );
    if (typeof IntersectionObserver === "undefined") {
      for (const card of cards) {
        const featureId = card.dataset.discoveryFeatureId;
        if (FEATURE_IDS.includes(featureId as FeatureId)) {
          recordExposure(featureId as FeatureId);
        }
      }
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const featureId = (entry.target as HTMLElement).dataset
            .discoveryFeatureId;
          if (FEATURE_IDS.includes(featureId as FeatureId)) {
            recordExposure(featureId as FeatureId);
          }
          observer.unobserve(entry.target);
        }
      },
      { threshold: 0.25 }
    );
    for (const card of cards) observer.observe(card);
    return () => observer.disconnect();
  }, [endpoint, features, measurementAvailable, sendSignal]);

  async function handleOpen(feature: ProductFeature) {
    setExpandedFeatureId(feature.id);
    if (!measurementAvailable) return;
    try {
      const data = await sendSignal(endpoint, feature.id, "open");
      if (data) {
        setFeatures(data.features);
        setMeasurementAvailable(data.measurementAvailable);
      }
    } catch {
      // A proposal remains readable even when its analytics signal fails.
    }
  }

  async function handleInterest(
    feature: ProductFeature,
    action: "interest" | "withdraw"
  ) {
    const revision = scopeRevision.current;
    setPendingFeatureId(feature.id);
    setSignalError(null);
    try {
      const options =
        action === "interest"
          ? {
              intent:
                selectedIntents[feature.id] ?? feature.interest.intent ?? "",
              pilot:
                pilotSelections[feature.id] ?? feature.interest.pilot ?? false,
            }
          : undefined;
      const nextFeatures = await sendSignal(
        endpoint,
        feature.id,
        action,
        options
      );
      if (revision !== scopeRevision.current || !nextFeatures) return;
      setFeatures(nextFeatures.features.slice(0, 3));
      setMeasurementAvailable(nextFeatures.measurementAvailable);
      if (action === "withdraw") {
        setSelectedIntents((current) => {
          const next = { ...current };
          delete next[feature.id];
          return next;
        });
        setPilotSelections((current) => {
          const next = { ...current };
          delete next[feature.id];
          return next;
        });
      }
    } catch {
      if (revision !== scopeRevision.current) return;
      setSignalError(
        action === "withdraw"
          ? "No pudimos retirar el interés. Inténtalo de nuevo."
          : "No pudimos guardar el interés. Inténtalo de nuevo."
      );
    } finally {
      if (revision === scopeRevision.current) setPendingFeatureId(null);
    }
  }

  return (
    <section
      ref={listRef}
      aria-label="Propuestas de funcionalidades"
      data-role={role || undefined}
      className="grid gap-4"
    >
      <div>
        <h2 className="text-lg font-bold text-slate-950">
          Lo que estamos explorando
        </h2>
        <p className="mt-1 text-sm leading-6 text-slate-700">
          Estas propuestas todavía no están disponibles. {measurementAvailable ===
          true
            ? "Si expresas interés, nos ayudas a priorizar; registrarlo no crea operaciones ni activa avisos."
            : measurementAvailable === false
              ? "Puedes conocerlas aunque el registro de interés aún no esté habilitado."
              : null}
        </p>
      </div>

      {loading && (
        <p role="status" className="text-sm text-slate-600">
          Cargando propuestas…
        </p>
      )}

      {loadError && (
        <div role="alert" className="grid gap-2 text-sm text-red-900">
          <p>{loadError}</p>
          <button
            type="button"
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            disabled={pendingFeatureId !== null}
            className="touch-target w-fit border border-slate-500 px-3 py-2 font-semibold text-slate-900"
          >
            Volver a intentar
          </button>
        </div>
      )}

      {signalError && (
        <p role="alert" className="text-sm text-red-900">
          {signalError}
        </p>
      )}

      {!loading && !loadError && features?.length === 0 && (
        <p className="text-sm text-slate-600">
          No hay propuestas disponibles para este perfil.
        </p>
      )}

      {features?.map((feature) => {
        const expanded = expandedFeatureId === feature.id;
        const selectedIntent =
          selectedIntents[feature.id] ?? feature.interest.intent ?? "";
        const pilotSelected =
          pilotSelections[feature.id] ?? feature.interest.pilot;
        const hasInterest = feature.interest.intent !== null;
        const pending = pendingFeatureId === feature.id;
        const anyActionPending = pendingFeatureId !== null;

        return (
          <article
            key={feature.id}
            data-discovery-feature-id={feature.id}
            className="grid gap-3 border border-slate-300 bg-white p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <h3 className="text-base font-bold text-slate-950">
                {feature.title}
              </h3>
              <span className="border border-amber-700 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-950">
                {feature.statusLabel}
              </span>
            </div>
            {!expanded && (
              <p className="text-sm leading-6 text-slate-700">
                {feature.summary}
              </p>
            )}

            {!expanded ? (
              <button
                type="button"
                onClick={() => void handleOpen(feature)}
                className="touch-target w-fit border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-900"
              >
                {measurementAvailable ? "Ver propuesta" : "Conocer propuesta"}
              </button>
            ) : (
              <div className="grid gap-3 border-t border-slate-200 pt-3">
                <p className="text-sm leading-6 text-slate-700">
                  {feature.summary}
                </p>
                {measurementAvailable && hasInterest ? (
                  <p className="text-sm font-semibold text-teal-900">
                    Has indicado interés
                    {feature.interest.pilot
                      ? " y quieres valorar un piloto."
                      : "."}
                  </p>
                ) : null}
                {!measurementAvailable ? (
                  <p role="status" className="text-sm text-slate-700">
                    El registro de interés aún no está habilitado.
                  </p>
                ) : (
                  <>
                    <fieldset className="grid gap-2">
                      <legend className="text-sm font-semibold text-slate-900">
                        ¿Qué te interesa hacer?
                      </legend>
                      {feature.intents.map((intent) => (
                        <label
                          key={intent.id}
                          className="flex cursor-pointer items-start gap-2 text-sm text-slate-800"
                        >
                          <input
                            type="radio"
                            name={"intent-" + feature.id}
                            value={intent.id}
                            checked={selectedIntent === intent.id}
                            onChange={() =>
                              setSelectedIntents((current) => ({
                                ...current,
                                [feature.id]: intent.id,
                              }))
                            }
                            disabled={anyActionPending}
                            className="mt-0.5 h-4 w-4 accent-teal-800"
                          />
                          {intent.label}
                        </label>
                      ))}
                    </fieldset>
                    <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        checked={pilotSelected}
                        onChange={(event) =>
                          setPilotSelections((current) => ({
                            ...current,
                            [feature.id]: event.target.checked,
                          }))
                        }
                        disabled={anyActionPending}
                        className="mt-0.5 h-4 w-4 accent-teal-800"
                      />
                      Quiero que consideren a mi academia para valorar un piloto.
                    </label>
                    <p className="text-xs leading-5 text-slate-600">
                      No hay fechas comprometidas. Esta respuesta no activa
                      notificaciones ni comunicaciones.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void handleInterest(feature, "interest")}
                        disabled={anyActionPending || !selectedIntent}
                        className="touch-target bg-slate-950 px-4 py-2 text-sm font-semibold text-white disabled:bg-slate-500"
                      >
                        {pending ? "Guardando…" : "Me interesa"}
                      </button>
                      {hasInterest && (
                        <button
                          type="button"
                          onClick={() =>
                            void handleInterest(feature, "withdraw")
                          }
                          disabled={anyActionPending}
                          className="touch-target border border-slate-500 px-4 py-2 text-sm font-semibold text-slate-900 disabled:text-slate-500"
                        >
                          Retirar interés
                        </button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
