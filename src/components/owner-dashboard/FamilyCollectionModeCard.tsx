"use client";

import { useEffect, useState } from "react";

interface FamilyCollectionPreference {
  organizationId: string;
  familyId: string;
  requestedMode: "manual" | "automatic";
  effectiveMode: "manual";
  version: number;
  entitlementRevision: number | null;
  preferenceEntitlementRevision: number | null;
  automaticPreferenceAvailable: boolean;
  automaticProcessingEnabled: false;
  automaticStatus: "paid_plan_required" | "not_released";
  requiresConfirmation: boolean;
}

export function FamilyCollectionModeCard({
  organizationId,
  familyId,
  canManage,
}: {
  organizationId: string;
  familyId: string;
  canManage: boolean;
}) {
  const [preference, setPreference] =
    useState<FamilyCollectionPreference | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setPreference(null);
    setErrorMessage(null);
    setSavedMessage(null);
    const query = new URLSearchParams({ organizationId, familyId });
    void fetch(
      `/api/v1/owner/billing/family-collection-preference?${query.toString()}`,
      { signal: controller.signal, cache: "no-store" }
    )
      .then(async (response) => {
        const payload = (await response.json().catch(() => null)) as
            | FamilyCollectionPreference
            | { detail?: string }
            | null;
        if (!response.ok || !payload || !("familyId" in payload)) {
          throw new Error(
            payload && "detail" in payload
              ? payload.detail
              : "No se pudo consultar la preferencia de esta familia."
          );
        }
        setPreference(payload);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "No se pudo consultar la preferencia de esta familia."
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [canManage, familyId, organizationId]);

  async function chooseMode(mode: "manual" | "automatic") {
    if (!preference || saving) return;
    const currentMode = preference.requiresConfirmation
      ? "manual"
      : preference.requestedMode;
    if (mode === currentMode) return;
    if (mode === "automatic" && !preference.automaticPreferenceAvailable) return;

    setSaving(true);
    setErrorMessage(null);
    setSavedMessage(null);
    try {
      const response = await fetch(
        "/api/v1/owner/billing/family-collection-preference",
        {
          method: "PUT",
          headers: {
            "content-type": "application/json",
            "idempotency-key": `family-preference-${crypto.randomUUID()}`,
          },
          body: JSON.stringify({
            organizationId,
            familyId,
            mode,
            expectedVersion: preference.version,
          }),
        }
      );
      const payload = (await response.json().catch(() => null)) as
        | FamilyCollectionPreference
        | { detail?: string }
        | null;
      if (!response.ok || !payload || !("familyId" in payload)) {
        throw new Error(
          payload && "detail" in payload
            ? payload.detail
            : "No se pudo guardar. Recarga e inténtalo de nuevo."
        );
      }
      setPreference(payload);
      setSavedMessage(
        mode === "automatic"
          ? "Solicitud automática guardada; el cobro efectivo sigue siendo manual."
          : "Preferencia manual guardada para esta familia."
      );
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo guardar. Recarga e inténtalo de nuevo."
      );
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return (
      <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm leading-5 text-slate-600">
        La modalidad se configura por familia y requiere acceso a todas las
        sedes de la academia.
      </p>
    );
  }

  const selectedMode = preference?.requiresConfirmation
    ? "manual"
    : (preference?.requestedMode ?? "manual");

  return (
    <section
      aria-labelledby="family-collection-mode-title"
      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
    >
      <div>
        <h3
          id="family-collection-mode-title"
          className="text-sm font-bold text-slate-900"
        >
          Cobro familiar: modalidad efectiva manual
        </h3>
        <p className="mt-1 text-sm leading-5 text-slate-600">
          Puedes guardar una solicitud futura de cobro automático; aún no inicia
          cargos ni modifica los ya emitidos.
        </p>
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-slate-600" role="status">
          Cargando preferencia…
        </p>
      ) : errorMessage && !preference ? (
        <p className="mt-3 text-sm text-red-800" role="alert">
          {errorMessage}
        </p>
      ) : (
        <>
          <fieldset className="mt-3 grid gap-2 sm:grid-cols-2" disabled={saving}>
            <legend className="sr-only">Preferencia de cobro</legend>
            <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <input
                checked={selectedMode === "manual"}
                className="size-4 accent-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
                name={`family-collection-mode-${familyId}`}
                onChange={() => void chooseMode("manual")}
                type="radio"
                value="manual"
              />
              <span className="text-sm font-semibold text-slate-900">
                Manual
              </span>
            </label>
            <label
              className={`flex min-h-12 items-center gap-3 rounded-xl border bg-white px-3 py-2 ${
                preference?.automaticPreferenceAvailable
                  ? "cursor-pointer border-slate-200"
                  : "cursor-not-allowed border-slate-200 opacity-70"
              }`}
            >
              <input
                checked={selectedMode === "automatic"}
                className="size-4 accent-teal-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
                disabled={!preference?.automaticPreferenceAvailable}
                name={`family-collection-mode-${familyId}`}
                onChange={() => void chooseMode("automatic")}
                type="radio"
                value="automatic"
              />
              <span className="text-sm font-semibold text-slate-900">
                Solicitar automático
              </span>
            </label>
          </fieldset>

          {preference?.requiresConfirmation ? (
            <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-sm leading-5 text-amber-950">
              {preference.automaticPreferenceAvailable
                ? "La solicitud automática anterior dejó de ser válida al cambiar el plan. La familia sigue en modo manual; vuelve a solicitarla si quieres conservar esa preferencia futura."
                : "La solicitud automática anterior dejó de ser válida al cambiar el plan. La familia queda en modo manual; podrás volver a solicitarla con un plan de pago vigente."}
            </p>
          ) : null}
          {preference && !preference.automaticPreferenceAvailable ? (
            <p className="mt-2 text-xs leading-5 text-slate-600">
              La solicitud automática solo se puede guardar con un plan de pago
              vigente.
            </p>
          ) : null}
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">
            La solicitud no autoriza al pagador ni inicia cobros. Activar esta
            modalidad requiere consentimiento, habilitar el procesamiento y
            completar sus pruebas de seguridad.
          </p>
        </>
      )}

      <div aria-live="polite" className="mt-2 min-h-5 text-xs">
        {saving ? <span className="text-slate-600">Guardando…</span> : null}
        {!saving && savedMessage ? (
          <span className="text-teal-900">{savedMessage}</span>
        ) : null}
        {!saving && errorMessage && preference ? (
          <span className="text-red-700" role="alert">
            {errorMessage}
          </span>
        ) : null}
      </div>
    </section>
  );
}
