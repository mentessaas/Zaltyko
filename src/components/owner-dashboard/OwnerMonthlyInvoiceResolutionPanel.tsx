"use client";

import { useEffect, useRef, useState } from "react";

export type ResolutionAction =
  | { kind: "tariff"; enrollmentId: string; athleteName: string | null }
  | {
      kind: "family";
      enrollmentId: string;
      athleteId: string;
      athleteName: string | null;
    }
  | { kind: "payer"; familyId: string; athleteIds: string[] };

type PricePlanOption = {
  id: string;
  name: string;
  amountCents: number;
  currency: string;
  cadence: string;
};

type FamilyAssociationOption = {
  familyId: string;
  athletes: Array<{ athleteId: string; athleteName: string | null }>;
  payers: Array<{
    familyPayerId: string;
    displayName: string | null;
    isPrimary: boolean;
  }>;
};

type RetryRequest = { key: string; body: unknown };

function responseData<T>(payload: unknown): T | null {
  if (payload && typeof payload === "object" && "data" in payload) {
    return (payload as { data: T }).data;
  }
  return null;
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value
    )
  );
}

function responseMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object") {
    const detail = "detail" in payload ? payload.detail : undefined;
    const message = "message" in payload ? payload.message : undefined;
    if (typeof detail === "string") return detail;
    if (typeof message === "string") return message;
  }
  return fallback;
}

function displayName(value: string | null | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

function parseMonthlyAmountCents(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) && cents > 0 && cents <= 2_147_483_647
    ? cents
    : null;
}

const fieldClassName =
  "min-h-11 w-full border border-slate-400 bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800";
const primaryButtonClassName =
  "touch-target min-h-11 border border-teal-800 bg-teal-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
const secondaryButtonClassName =
  "touch-target min-h-11 border border-slate-400 bg-white px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50";

export function OwnerMonthlyInvoiceResolutionPanel({
  action,
  organizationId,
  locationId,
  defaultCurrency,
  servicePeriodStart,
  onCancel,
  onSaved,
}: {
  action: ResolutionAction;
  organizationId: string;
  locationId: string;
  defaultCurrency: string;
  servicePeriodStart: string;
  onCancel: () => void;
  onSaved: (kind: "tariff" | "family", familyId?: string) => Promise<void>;
}) {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pricePlanOptionsError, setPricePlanOptionsError] = useState(false);
  const [optionsRetry, setOptionsRetry] = useState(0);
  const [pricePlans, setPricePlans] = useState<PricePlanOption[]>([]);
  const [families, setFamilies] = useState<FamilyAssociationOption[]>([]);
  const [selectedPricePlanId, setSelectedPricePlanId] = useState("");
  const [newPricePlanName, setNewPricePlanName] = useState("");
  const [newPricePlanAmount, setNewPricePlanAmount] = useState("");
  const [pricePlanNotice, setPricePlanNotice] = useState("");
  const [priceStartsOn, setPriceStartsOn] = useState(servicePeriodStart);
  const [effectiveFrom, setEffectiveFrom] = useState(servicePeriodStart);
  const [selectedFamilyId, setSelectedFamilyId] = useState(
    action.kind === "payer" ? action.familyId : ""
  );
  const [selectedPayerId, setSelectedPayerId] = useState("");
  const [athleteIds, setAthleteIds] = useState<string[]>(
    action.kind === "family"
      ? [action.athleteId]
      : action.kind === "payer"
        ? action.athleteIds
        : []
  );
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [relationship, setRelationship] = useState<
    "parent" | "legal_guardian" | "foster_guardian" | "other"
  >("parent");
  const retryRequest = useRef<RetryRequest | null>(null);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ organizationId, locationId });
    void (async () => {
      try {
        const endpoint =
          action.kind === "tariff"
            ? `/api/v1/owner/price-plans/options?${params.toString()}`
            : `/api/v1/owner/families/options?${params.toString()}`;
        const response = await fetch(endpoint, { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            responseMessage(
              payload,
              action.kind === "tariff"
                ? "No se pudieron cargar las tarifas disponibles."
                : "No se pudieron cargar las familias disponibles."
            )
          );
        }
        if (action.kind === "tariff") {
          const data = responseData<{ items: PricePlanOption[] }>(payload);
          if (!data || !Array.isArray(data.items)) {
            throw new Error(
              "La respuesta de tarifas no tiene el formato esperado."
            );
          }
          if (active) {
            setPricePlans(data.items);
            setSelectedPricePlanId(data.items[0]?.id ?? "");
          }
        } else {
          const data = responseData<{ families: FamilyAssociationOption[] }>(
            payload
          );
          if (!data || !Array.isArray(data.families)) {
            throw new Error(
              "La respuesta de familias no tiene el formato esperado."
            );
          }
          if (active) setFamilies(data.families);
        }
      } catch (cause) {
        if (active) {
          if (action.kind === "tariff") setPricePlanOptionsError(true);
          setError(
            cause instanceof Error
              ? cause.message
              : "No se pudieron cargar las opciones."
          );
        }
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [action.kind, locationId, optionsRetry, organizationId]);

  function requestKey(prefix: string, body: unknown): string {
    const previous = retryRequest.current;
    const key =
      previous && JSON.stringify(previous.body) === JSON.stringify(body)
        ? previous.key
        : `${prefix}:${crypto.randomUUID()}`;
    retryRequest.current = { key, body };
    return key;
  }

  async function createPricePlan() {
    if (action.kind !== "tariff") return;
    const name = newPricePlanName.trim();
    const amountCents = parseMonthlyAmountCents(newPricePlanAmount);
    if (!name || name.length > 100 || amountCents === null) {
      setError(
        "Introduce un nombre de hasta 100 caracteres y un importe mensual válido mayor que cero."
      );
      return;
    }
    const body = {
      organizationId,
      locationId,
      name,
      amountCents,
    };
    const key = requestKey("owner-monthly-price-plan", body);
    setBusy(true);
    setError("");
    setPricePlanNotice("");
    try {
      const response = await fetch("/api/v1/owner/billing/price-plans", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": key,
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      const created = responseData<PricePlanOption>(payload);
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          retryRequest.current = null;
        }
        throw new Error(
          responseMessage(payload, "No se pudo crear la tarifa mensual.")
        );
      }
      if (
        !created ||
        typeof created.id !== "string" ||
        typeof created.name !== "string" ||
        typeof created.amountCents !== "number" ||
        typeof created.currency !== "string" ||
        created.cadence !== "monthly"
      ) {
        throw new Error(
          "La respuesta de la tarifa no tiene el formato esperado."
        );
      }
      retryRequest.current = null;
      setPricePlans((current) => [
        ...current.filter((plan) => plan.id !== created.id),
        created,
      ]);
      setSelectedPricePlanId(created.id);
      setNewPricePlanName("");
      setNewPricePlanAmount("");
      setPricePlanNotice(
        "Tarifa creada. Revisa el importe y confirma aparte su asignación a la inscripción."
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo crear la tarifa mensual."
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveTariff() {
    if (action.kind !== "tariff" || !selectedPricePlanId || !priceStartsOn) {
      setError("Selecciona una tarifa y la fecha desde la que se aplica.");
      return;
    }
    const body = {
      organizationId,
      locationId,
      pricePlanId: selectedPricePlanId,
      startsOn: priceStartsOn,
    };
    const key = requestKey("owner-price-assignment", body);
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/v1/owner/enrollments/${encodeURIComponent(action.enrollmentId)}/price-plan`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": key,
          },
          body: JSON.stringify(body),
        }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          retryRequest.current = null;
        }
        throw new Error(
          responseMessage(payload, "No se pudo asignar la tarifa.")
        );
      }
      retryRequest.current = null;
      await onSaved("tariff");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "No se pudo asignar la tarifa."
      );
    } finally {
      setBusy(false);
    }
  }

  async function saveAssociation() {
    if (action.kind === "tariff") return;
    const familyId =
      action.kind === "payer" ? action.familyId : selectedFamilyId;
    const uniqueAthleteIds = [...new Set(athleteIds)];
    const selectedFamily = families.find(
      (family) => family.familyId === familyId
    );
    const existingPayerId = selectedFamily?.payers.some(
      (payer) => payer.familyPayerId === selectedPayerId
    )
      ? selectedPayerId
      : "";
    if (
      uniqueAthleteIds.length === 0 ||
      !effectiveFrom ||
      (!existingPayerId && (!givenName.trim() || !familyName.trim()))
    ) {
      setError(
        "Selecciona la familia y las gimnastas, y completa el nombre de la persona pagadora adulta."
      );
      return;
    }
    const body = {
      organizationId,
      locationId,
      ...(familyId ? { familyId } : {}),
      athleteIds: uniqueAthleteIds,
      payer: existingPayerId
        ? { familyPayerId: existingPayerId }
        : {
            givenName: givenName.trim(),
            familyName: familyName.trim(),
            relationship,
          },
      effectiveFrom,
    };
    const key = requestKey("owner-family-association", body);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/v1/owner/families/associations", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Idempotency-Key": key,
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500) {
          retryRequest.current = null;
        }
        throw new Error(
          responseMessage(payload, "No se pudo guardar la relación familiar.")
        );
      }
      retryRequest.current = null;
      const data = responseData<{ familyId?: unknown }>(payload);
      await onSaved(
        "family",
        isUuid(data?.familyId) ? data.familyId : undefined
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo guardar la relación familiar."
      );
    } finally {
      setBusy(false);
    }
  }

  const selectedFamily = families.find(
    (family) => family.familyId === selectedFamilyId
  );

  return (
    <section
      aria-labelledby="owner-monthly-resolution-heading"
      className="mx-auto mt-6 grid max-w-4xl gap-4 border border-slate-300 bg-white p-5 sm:p-7"
    >
      <div>
        <h2 id="owner-monthly-resolution-heading" className="text-xl font-bold">
          {action.kind === "tariff"
            ? `Asignar tarifa a ${displayName(action.athleteName, "la gimnasta")}`
            : action.kind === "family"
              ? `Vincular a ${displayName(action.athleteName, "la gimnasta")} a una familia`
              : "Añadir una persona pagadora adulta"}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {action.kind === "tariff"
            ? "La tarifa y su importe vienen del catálogo. La fecha de inicio se guarda en el historial de la inscripción."
            : "Selecciona una familia y confirma qué persona adulta será responsable. Solo se solicitan los datos necesarios para esta relación."}
        </p>
      </div>

      {loading && <p role="status">Cargando opciones…</p>}

      {action.kind === "tariff" && !loading && (
        <div className="grid gap-4 sm:grid-cols-2">
          {pricePlans.length > 0 ? (
            <>
              <label className="grid gap-2">
                <span className="text-sm font-bold">Tarifa mensual</span>
                <select
                  value={selectedPricePlanId}
                  onChange={(event) => {
                    setSelectedPricePlanId(event.target.value);
                    setPricePlanNotice("");
                  }}
                  disabled={busy}
                  className={fieldClassName}
                  required
                >
                  <option value="">Selecciona una tarifa</option>
                  {pricePlans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name} ·{" "}
                      {formatMoney(plan.amountCents, plan.currency)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-bold">Vigente desde</span>
                <input
                  type="date"
                  value={priceStartsOn}
                  onChange={(event) => setPriceStartsOn(event.target.value)}
                  disabled={busy}
                  required
                  className={fieldClassName}
                />
              </label>
            </>
          ) : pricePlanOptionsError ? (
            <div className="grid gap-3 sm:col-span-2">
              <p className="text-sm leading-6 text-slate-600">
                No se pudieron comprobar las tarifas de esta sede. Reintenta
                antes de crear una nueva.
              </p>
              <button
                type="button"
                onClick={() => {
                  setError("");
                  setLoading(true);
                  setPricePlanOptionsError(false);
                  setOptionsRetry((current) => current + 1);
                }}
                disabled={busy || loading}
                className={`${secondaryButtonClassName} w-fit`}
              >
                Reintentar cargar tarifas
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:col-span-2">
              <p className="text-sm leading-6 text-slate-600">
                No hay tarifas mensuales para esta sede. Crea una para poder
                asignarla a la inscripción.
              </p>
              <label className="grid gap-2">
                <span className="text-sm font-bold">Nombre de la tarifa</span>
                <input
                  value={newPricePlanName}
                  onChange={(event) => setNewPricePlanName(event.target.value)}
                  maxLength={100}
                  disabled={busy}
                  required
                  className={fieldClassName}
                />
              </label>
              <div className="grid max-w-md gap-2">
                <label
                  htmlFor="monthly-price-plan-amount"
                  className="text-sm font-bold"
                >
                  Importe mensual ({defaultCurrency})
                </label>
                <input
                  id="monthly-price-plan-amount"
                  type="text"
                  inputMode="decimal"
                  value={newPricePlanAmount}
                  onChange={(event) =>
                    setNewPricePlanAmount(event.target.value)
                  }
                  placeholder="35,00"
                  disabled={busy}
                  required
                  aria-describedby="monthly-price-plan-amount-help"
                  className={fieldClassName}
                />
                <p
                  id="monthly-price-plan-amount-help"
                  className="text-xs text-slate-600"
                >
                  Se usará {defaultCurrency}, la moneda de la academia. Puedes
                  usar coma o punto decimal; la tarifa será mensual.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void createPricePlan()}
                disabled={busy}
                className={`${primaryButtonClassName} w-fit`}
              >
                {busy ? "Guardando…" : "Crear tarifa mensual"}
              </button>
            </div>
          )}
        </div>
      )}

      {pricePlanNotice && (
        <p role="status" aria-live="polite" className="text-sm text-teal-900">
          {pricePlanNotice}
        </p>
      )}

      {(action.kind === "family" || action.kind === "payer") && !loading && (
        <div className="grid gap-4">
          {action.kind === "family" ? (
            <label className="grid gap-2">
              <span className="text-sm font-bold">Familia</span>
              <select
                value={selectedFamilyId}
                onChange={(event) => {
                  setSelectedFamilyId(event.target.value);
                  setSelectedPayerId("");
                }}
                disabled={busy}
                className={fieldClassName}
              >
                <option value="">Crear una familia nueva</option>
                {families.map((family) => (
                  <option key={family.familyId} value={family.familyId}>
                    {family.athletes.length
                      ? family.athletes
                          .map((athlete) =>
                            displayName(
                              athlete.athleteName,
                              "Gimnasta sin nombre"
                            )
                          )
                          .join(", ")
                      : "Familia sin gimnastas asociadas"}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-sm font-semibold">
              Familia:{" "}
              {selectedFamily?.athletes
                .map((athlete) =>
                  displayName(athlete.athleteName, "Gimnasta sin nombre")
                )
                .join(", ") || "Familia seleccionada"}
            </p>
          )}

          {action.kind === "payer" &&
            families
              .find((family) => family.familyId === action.familyId)
              ?.athletes.map((athlete) => (
                <label
                  key={athlete.athleteId}
                  className="flex min-h-11 items-center gap-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={athleteIds.includes(athlete.athleteId)}
                    onChange={(event) =>
                      setAthleteIds((current) =>
                        event.target.checked
                          ? [...new Set([...current, athlete.athleteId])]
                          : current.filter((id) => id !== athlete.athleteId)
                      )
                    }
                    disabled={busy}
                    className="h-5 w-5 accent-teal-800"
                  />
                  {displayName(athlete.athleteName, "Gimnasta sin nombre")}
                </label>
              ))}

          {selectedFamily?.payers.length ? (
            <label className="grid gap-2">
              <span className="text-sm font-bold">Persona pagadora</span>
              <select
                value={selectedPayerId}
                onChange={(event) => setSelectedPayerId(event.target.value)}
                disabled={busy}
                className={fieldClassName}
              >
                <option value="">Añadir persona adulta nueva</option>
                {selectedFamily.payers.map((payer) => (
                  <option key={payer.familyPayerId} value={payer.familyPayerId}>
                    {displayName(
                      payer.displayName,
                      "Persona pagadora sin nombre"
                    )}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {!selectedPayerId && (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="text-sm font-bold">
                  Nombre de la persona adulta
                </span>
                <input
                  value={givenName}
                  onChange={(event) => setGivenName(event.target.value)}
                  disabled={busy}
                  required
                  maxLength={100}
                  className={fieldClassName}
                />
              </label>
              <label className="grid gap-2">
                <span className="text-sm font-bold">Apellidos</span>
                <input
                  value={familyName}
                  onChange={(event) => setFamilyName(event.target.value)}
                  disabled={busy}
                  required
                  maxLength={100}
                  className={fieldClassName}
                />
              </label>
              <label className="grid gap-2 sm:col-span-2">
                <span className="text-sm font-bold">
                  Relación con la gimnasta
                </span>
                <select
                  value={relationship}
                  onChange={(event) =>
                    setRelationship(event.target.value as typeof relationship)
                  }
                  disabled={busy}
                  className={fieldClassName}
                >
                  <option value="parent">Madre o padre</option>
                  <option value="legal_guardian">Tutor/a legal</option>
                  <option value="foster_guardian">Acogedor/a</option>
                  <option value="other">Otra relación autorizada</option>
                </select>
              </label>
            </div>
          )}

          <label className="grid max-w-md gap-2">
            <span className="text-sm font-bold">Fecha efectiva</span>
            <input
              type="date"
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
              disabled={busy}
              required
              className={fieldClassName}
              aria-describedby="family-association-effective-help"
            />
            <span
              id="family-association-effective-help"
              className="text-xs text-slate-600"
            >
              La fecha sugerida es el primer día del periodo; se usará para
              comprobar la cobertura mensual. Confírmala o ajústala antes de
              guardar.
            </span>
          </label>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {action.kind === "tariff" ? (
          <button
            type="button"
            onClick={() => void saveTariff()}
            disabled={
              busy || loading || pricePlans.length === 0 || !selectedPricePlanId
            }
            className={primaryButtonClassName}
          >
            {busy ? "Guardando…" : "Guardar tarifa"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => void saveAssociation()}
            disabled={busy || loading}
            className={primaryButtonClassName}
          >
            {busy ? "Guardando…" : "Guardar vínculo"}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className={secondaryButtonClassName}
        >
          Cancelar
        </button>
      </div>
    </section>
  );
}
