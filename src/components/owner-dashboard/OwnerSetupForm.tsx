"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Building2, MapPin, ShieldCheck } from "lucide-react";
import { parseOwnerSetupReceipt } from "@/components/owner-dashboard/owner-setup-response";
import {
  ADMINISTRATIVE_MARKET_REGISTRY,
  getAdministrativeMarketCapability,
  type AdministrativeMarketCode,
} from "@/modules/organizations/domain/administrative-market-capabilities";

type BootstrapRequest = {
  organizationName: string;
  locationName: string;
  primaryDiscipline: string;
  additionalDisciplines: string[];
  complementaryActivities: string[];
  customActivityName?: string;
  countryCode: AdministrativeMarketCode;
  defaultCurrency?: "EUR" | "MXN";
  timezone?: string;
  contractualAcceptance?: { accepted: true; policyVersion: string };
};

type RetryRequest = {
  key: string;
  body: BootstrapRequest;
  serializedBody: string;
  ownerUserId: string | null;
};

const RETRY_STORAGE_VERSION = 1;

function retryStorageKey(ownerUserId: string) {
  return "zaltyko-owner-bootstrap-retry:v1:" + ownerUserId;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function isBootstrapRequest(value: unknown): value is BootstrapRequest {
  if (!isRecord(value)) return false;
  const allowedKeys = [
    "organizationName",
    "locationName",
    "primaryDiscipline",
    "additionalDisciplines",
    "complementaryActivities",
    "customActivityName",
    "countryCode",
    "defaultCurrency",
    "timezone",
    "contractualAcceptance",
  ];
  if (Object.keys(value).some((key) => !allowedKeys.includes(key))) return false;
  if (
    typeof value.organizationName !== "string" ||
    value.organizationName.length < 2 ||
    value.organizationName.length > 120 ||
    typeof value.locationName !== "string" ||
    value.locationName.length < 2 ||
    value.locationName.length > 120 ||
    (value.primaryDiscipline !== "artistic" &&
      value.primaryDiscipline !== "rhythmic") ||
    !isStringArray(value.additionalDisciplines) ||
    !isStringArray(value.complementaryActivities) ||
    (value.customActivityName !== undefined &&
      (typeof value.customActivityName !== "string" ||
        value.customActivityName.length > 80)) ||
    (value.countryCode !== "ES" && value.countryCode !== "MX")
  ) {
    return false;
  }
  if (
    value.additionalDisciplines.some(
      (discipline) => discipline !== "artistic" && discipline !== "rhythmic"
    ) ||
    value.complementaryActivities.some(
      (activity) =>
        ![
          "aerial_silks",
          "aerial_hoop",
          "dance",
          "physical_conditioning",
        ].includes(activity)
    )
  ) {
    return false;
  }

  const market = getAdministrativeMarketCapability(value.countryCode);
  if (!market) return false;
  if (value.defaultCurrency !== undefined) {
    if (
      (value.defaultCurrency !== "EUR" && value.defaultCurrency !== "MXN") ||
      !market.currencies.includes(value.defaultCurrency)
    ) {
      return false;
    }
  }
  if (
    value.timezone !== undefined &&
    (typeof value.timezone !== "string" ||
      !market.timezones.includes(value.timezone))
  ) {
    return false;
  }
  if (
    value.countryCode === "MX" &&
    (!value.defaultCurrency || typeof value.timezone !== "string")
  ) {
    return false;
  }
  if (value.contractualAcceptance !== undefined) {
    if (
      !isRecord(value.contractualAcceptance) ||
      !hasExactKeys(value.contractualAcceptance, ["accepted", "policyVersion"]) ||
      value.contractualAcceptance.accepted !== true ||
      typeof value.contractualAcceptance.policyVersion !== "string" ||
      value.contractualAcceptance.policyVersion.length < 1 ||
      value.contractualAcceptance.policyVersion.length > 64
    ) {
      return false;
    }
  }
  return true;
}

function parseStoredRetry(value: string, ownerUserId: string): RetryRequest | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (
    !isRecord(parsed) ||
    !hasExactKeys(parsed, ["version", "ownerUserId", "key", "serializedBody"]) ||
    parsed.version !== RETRY_STORAGE_VERSION ||
    parsed.ownerUserId !== ownerUserId ||
    typeof parsed.key !== "string" ||
    parsed.key.length < 8 ||
    parsed.key.length > 150 ||
    typeof parsed.serializedBody !== "string"
  ) {
    return null;
  }

  let body: unknown;
  try {
    body = JSON.parse(parsed.serializedBody);
  } catch {
    return null;
  }
  if (
    !isBootstrapRequest(body) ||
    JSON.stringify(body) !== parsed.serializedBody
  ) {
    return null;
  }

  return {
    key: parsed.key,
    body,
    serializedBody: parsed.serializedBody,
    ownerUserId,
  };
}

export type OwnerSetupContractualConsent = {
  policyVersion: string;
  requiresAcceptance: boolean;
};

export function OwnerSetupForm({
  contractualConsent,
  previewOnly = false,
  ownerUserId,
}: {
  contractualConsent?: OwnerSetupContractualConsent | null;
  previewOnly?: boolean;
  ownerUserId?: string;
} = {}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [countryCode, setCountryCode] = useState<AdministrativeMarketCode>(
    "ES"
  );
  const [timezone, setTimezone] = useState<string>(
    ADMINISTRATIVE_MARKET_REGISTRY.ES.defaultTimezone ?? ""
  );
  const [primaryDiscipline, setPrimaryDiscipline] = useState<
    "artistic" | "rhythmic" | null
  >(null);
  const idempotencyKey = useRef<string | null>(null);
  const [retryRequest, setRetryRequest] = useState<RetryRequest | null>(null);
  const [restoredOwnerUserId, setRestoredOwnerUserId] = useState<string | null>(
    null
  );
  const [persistenceNotice, setPersistenceNotice] = useState<string | null>(
    null
  );
  const [formGeneration, setFormGeneration] = useState(0);
  const restorePending = Boolean(
    ownerUserId && restoredOwnerUserId !== ownerUserId
  );
  const activeRetryRequest =
    retryRequest?.ownerUserId === (ownerUserId ?? null)
      ? retryRequest
      : null;

  useEffect(() => {
    idempotencyKey.current = null;
    setRetryRequest(null);
    setError(null);
    setConsentAccepted(false);
    setCountryCode("ES");
    setTimezone(ADMINISTRATIVE_MARKET_REGISTRY.ES.defaultTimezone ?? "");
    setPrimaryDiscipline(null);
    setPersistenceNotice(null);

    if (!ownerUserId) {
      setRestoredOwnerUserId(null);
      setFormGeneration((generation) => generation + 1);
      return;
    }

    let restored: RetryRequest | null = null;
    let notice: string | null = null;
    try {
      const stored = sessionStorage.getItem(retryStorageKey(ownerUserId));
      if (stored) {
        restored = parseStoredRetry(stored, ownerUserId);
        if (!restored) {
          sessionStorage.removeItem(retryStorageKey(ownerUserId));
          notice =
            "No pudimos validar un intento guardado. No lo enviaremos automáticamente; comprueba si la academia ya se creó antes de iniciar otro.";
        }
      }
    } catch {
      notice =
        "No pudimos comprobar los intentos guardados de esta pestaña. No reintentaremos nada automáticamente.";
    }

    if (restored) {
      idempotencyKey.current = restored.key;
      setRetryRequest(restored);
      setCountryCode(restored.body.countryCode);
      const restoredMarket = getAdministrativeMarketCapability(
        restored.body.countryCode
      );
      setTimezone(
        restored.body.timezone ?? restoredMarket?.defaultTimezone ?? ""
      );
      setPrimaryDiscipline(
        restored.body.primaryDiscipline as "artistic" | "rhythmic"
      );
      setConsentAccepted(Boolean(restored.body.contractualAcceptance));
    }
    setPersistenceNotice(notice);
    setRestoredOwnerUserId(ownerUserId);
    setFormGeneration((generation) => generation + 1);
  }, [ownerUserId]);

  function clearStoredRetry() {
    if (!ownerUserId) return true;
    try {
      sessionStorage.removeItem(retryStorageKey(ownerUserId));
      return true;
    } catch {
      return false;
    }
  }

  async function sendBootstrap(
    key: string,
    body: BootstrapRequest,
    serializedBody = JSON.stringify(body)
  ) {
    setPending(true);
    setError(null);
    const request: RetryRequest = {
      key,
      body,
      serializedBody,
      ownerUserId: ownerUserId ?? null,
    };
    setRetryRequest(request);
    if (ownerUserId) {
      try {
        sessionStorage.setItem(
          retryStorageKey(ownerUserId),
          JSON.stringify({
            version: RETRY_STORAGE_VERSION,
            ownerUserId,
            key,
            serializedBody,
          })
        );
        setPersistenceNotice(null);
      } catch {
        setPersistenceNotice(
          "El navegador bloqueó el guardado del intento; el reintento solo se conserva mientras esta página permanezca abierta."
        );
      }
    } else {
      setPersistenceNotice(
        "Este intento solo se conserva mientras esta página permanezca abierta; no se guardará entre recargas."
      );
    }
    let responseFailureMessage: string | null = null;
    try {
      const response = await fetch("/api/v1/organizations/bootstrap", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": key,
        },
        body: serializedBody,
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as {
          detail?: string;
        } | null;
        const resultUncertain =
          response.status >= 500 ||
          response.status === 401 ||
          response.status === 403;
        if (!resultUncertain) {
          idempotencyKey.current = null;
          setRetryRequest(null);
          const storedRetryCleared = clearStoredRetry();
          setPersistenceNotice(
            storedRetryCleared
              ? null
              : "No pudimos borrar el recibo local del intento definitivo. Si se restaura, se conservará su misma clave."
          );
        }
        responseFailureMessage =
          response.status >= 500
            ? "No podemos confirmar si se creó el espacio. Reintenta este mismo envío; conservaremos los datos para evitar duplicados."
            : resultUncertain
              ? "No podemos confirmar el resultado de este envío. Reintenta el mismo intento; conservaremos los datos y la clave para evitar duplicados."
              : (problem?.detail ?? "No se ha podido crear el espacio.");
        throw new Error(responseFailureMessage);
      }
      const result = parseOwnerSetupReceipt(await response.json());
      if (!result) {
        throw new Error("La respuesta no contiene un recibo de alta válido.");
      }
      idempotencyKey.current = null;
      setRetryRequest(null);
      const storedRetryCleared = clearStoredRetry();
      setPersistenceNotice(
        storedRetryCleared
          ? null
          : "No pudimos borrar el recibo local. Si se restaura, repetirá la misma clave y el servidor devolverá el mismo resultado."
      );
      router.replace(`/owner?organizationId=${result.organizationId}`);
      router.refresh();
    } catch {
      setError(
        responseFailureMessage ??
          "No podemos confirmar si se creó el espacio. Reintenta este mismo envío; conservaremos los datos para evitar duplicados."
      );
      setPending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (previewOnly) return;
    if (restorePending) return;

    if (activeRetryRequest) {
      await sendBootstrap(
        activeRetryRequest.key,
        activeRetryRequest.body,
        activeRetryRequest.serializedBody
      );
      return;
    }

    if (!contractualConsent) {
      setError(
        "No pudimos comprobar los términos vigentes de tu cuenta. Recarga la página para volver a intentarlo."
      );
      return;
    }
    if (contractualConsent.requiresAcceptance && !consentAccepted) {
      setError(
        "Acepta los términos y la política de privacidad para continuar."
      );
      return;
    }
    const market = getAdministrativeMarketCapability(countryCode);
    if (!market) {
      setError("Selecciona un país disponible para el alta.");
      return;
    }
    const resolvedTimezone = timezone || market.defaultTimezone;
    if (!resolvedTimezone || !market.timezones.includes(resolvedTimezone)) {
      setError("Selecciona la zona horaria de la primera sede.");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const body: BootstrapRequest = {
      organizationName: String(formData.get("organizationName") ?? ""),
      locationName: String(formData.get("locationName") ?? ""),
      primaryDiscipline: String(formData.get("primaryDiscipline") ?? ""),
      additionalDisciplines: formData
        .getAll("additionalDisciplines")
        .map(String),
      complementaryActivities: formData
        .getAll("complementaryActivities")
        .map(String),
      customActivityName:
        String(formData.get("customActivityName") ?? "").trim() || undefined,
      countryCode,
      ...(countryCode === "MX"
        ? {
            defaultCurrency: market.defaultCurrency,
            timezone: resolvedTimezone,
          }
        : timezone && timezone !== market.defaultTimezone
          ? { timezone }
          : {}),
      ...(contractualConsent.requiresAcceptance
        ? {
            contractualAcceptance: {
              accepted: true as const,
              policyVersion: contractualConsent.policyVersion,
            },
          }
        : {}),
    };
    const key = idempotencyKey.current ?? crypto.randomUUID();
    idempotencyKey.current = key;
    await sendBootstrap(key, body);
  }

  const fieldsLocked =
    restorePending || pending || activeRetryRequest !== null;
  const selectedMarket = getAdministrativeMarketCapability(countryCode);

  if (!contractualConsent && !activeRetryRequest && !restorePending) {
    return (
      <p
        role="alert"
        className="rounded-[12px] mt-8 border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950"
      >
        No pudimos comprobar los términos vigentes de tu cuenta. Recarga la
        página para volver a intentarlo.
      </p>
    );
  }

  return (
    <form
      key={(ownerUserId ?? "anonymous") + ":" + formGeneration}
      onSubmit={submit}
      aria-busy={pending || restorePending}
      className="mt-8 grid gap-6"
    >
      <fieldset disabled={fieldsLocked} className="grid gap-6 border-0 p-0">
        <label className="grid gap-2 text-sm font-bold text-z-ink">
          Nombre de la academia
          <span className="relative">
            <Building2
              className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-z-soft"
              aria-hidden="true"
            />
            <input
              name="organizationName"
              defaultValue={activeRetryRequest?.body.organizationName}
              required
              minLength={2}
              maxLength={120}
              autoComplete="organization"
              className="touch-target w-full border border-z-line bg-white pl-10 pr-3 text-z-ink"
            />
          </span>
        </label>
        <fieldset className="grid gap-3">
          <legend className="text-sm font-bold text-z-ink">
            ¿Cuál es la especialidad principal de tu academia?
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="rounded-[12px] touch-target flex cursor-pointer items-center gap-3 border border-z-line bg-white px-4 py-3 text-sm font-semibold text-z-ink has-[:checked]:border-z-ink has-[:checked]:bg-z-brand-50">
              <input
                type="radio"
                name="primaryDiscipline"
                value="artistic"
                required
                defaultChecked={
                  activeRetryRequest?.body.primaryDiscipline === "artistic"
                }
                onChange={() => setPrimaryDiscipline("artistic")}
                className="h-5 w-5 accent-z-brand-500"
              />
              Gimnasia artística
            </label>
            <label className="rounded-[12px] touch-target flex cursor-pointer items-center gap-3 border border-z-line bg-white px-4 py-3 text-sm font-semibold text-z-ink has-[:checked]:border-z-ink has-[:checked]:bg-z-brand-50">
              <input
                type="radio"
                name="primaryDiscipline"
                value="rhythmic"
                required
                defaultChecked={
                  activeRetryRequest?.body.primaryDiscipline === "rhythmic"
                }
                onChange={() => setPrimaryDiscipline("rhythmic")}
                className="h-5 w-5 accent-z-brand-500"
              />
              Gimnasia rítmica
            </label>
          </div>
        </fieldset>
        <details className="border border-z-line bg-white">
          <summary className="touch-target cursor-pointer px-4 py-3 text-sm font-semibold text-z-ink">
            Añadir otras disciplinas o actividades (opcional)
          </summary>
          <fieldset className="grid gap-3 border-t border-z-line p-4">
            <legend className="px-1 text-sm text-z-soft">
              Puedes añadirlas ahora o más adelante.
            </legend>
            {primaryDiscipline && (
              <label className="rounded-[12px] touch-target flex cursor-pointer items-start gap-3 border border-z-line bg-white px-4 py-3 text-sm text-z-ink">
                <input
                  type="checkbox"
                  name="additionalDisciplines"
                  value={
                    primaryDiscipline === "artistic" ? "rhythmic" : "artistic"
                  }
                  defaultChecked={activeRetryRequest?.body.additionalDisciplines.includes(
                    primaryDiscipline === "artistic" ? "rhythmic" : "artistic"
                  )}
                  className="mt-0.5 h-5 w-5 accent-z-brand-500"
                />
                <span>
                  También ofrecemos gimnasia{" "}
                  {primaryDiscipline === "artistic" ? "rítmica" : "artística"}
                </span>
              </label>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["aerial_silks", "Telas aéreas"],
                ["aerial_hoop", "Aro aéreo"],
                ["dance", "Baile"],
                ["physical_conditioning", "Preparación física"],
              ].map(([value, label]) => (
                <label
                  key={value}
                  className="rounded-[12px] touch-target flex cursor-pointer items-center gap-3 border border-z-line bg-white px-4 py-3 text-sm text-z-ink"
                >
                  <input
                    type="checkbox"
                    name="complementaryActivities"
                    value={value}
                    defaultChecked={activeRetryRequest?.body.complementaryActivities.includes(
                      value
                    )}
                    className="h-5 w-5 accent-z-brand-500"
                  />
                  {label}
                </label>
              ))}
            </div>
            <label className="grid gap-2 text-sm font-semibold text-z-ink">
              Otra actividad (opcional)
              <input
                name="customActivityName"
                defaultValue={activeRetryRequest?.body.customActivityName}
                maxLength={80}
                placeholder="Por ejemplo, acrobacia"
                className="rounded-[12px] touch-target w-full border border-z-line bg-white px-3 text-z-ink"
              />
            </label>
            <p className="text-sm leading-6 text-z-soft">
              Cada actividad tendrá sus propias clases y grupos. Podrás añadir
              más adelante.
            </p>
          </fieldset>
        </details>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid content-start gap-2">
          <label className="grid gap-2 text-sm font-bold text-z-ink">
            País de la academia
            <select
              name="countryCode"
              required
              value={countryCode}
              onChange={(event) => {
                const nextCountry = event.target
                  .value as AdministrativeMarketCode;
                setCountryCode(nextCountry);
                setTimezone(
                  getAdministrativeMarketCapability(nextCountry)
                    ?.defaultTimezone ?? ""
                );
              }}
              className="rounded-[12px] touch-target w-full border border-z-line bg-white px-3 text-z-ink"
            >
              {Object.values(ADMINISTRATIVE_MARKET_REGISTRY).map((market) => (
                <option key={market.countryCode} value={market.countryCode}>
                  {market.label}
                </option>
              ))}
            </select>
          </label>
            <Link href="/contact?type=market_access" className="inline-flex min-h-11 items-center text-sm font-medium text-z-brand-600 underline underline-offset-4">
              ¿Tu país no aparece? Solicita acceso asistido
            </Link>
          </div>
          <label className="grid gap-2 text-sm font-bold text-z-ink">
            Nombre de la primera sede
            <span className="relative">
              <MapPin
                className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-z-soft"
                aria-hidden="true"
              />
              <input
                name="locationName"
                defaultValue={activeRetryRequest?.body.locationName}
                required
                minLength={2}
                maxLength={120}
                placeholder="Sede principal"
                className="touch-target w-full border border-z-line bg-white pl-10 pr-3 text-z-ink"
              />
            </span>
          </label>
          <label className="grid gap-2 text-sm font-bold text-z-ink">
            Zona horaria de la primera sede
            <select
              name="timezone"
              required={selectedMarket?.timezoneRequired ?? true}
              value={timezone}
              onChange={(event) => setTimezone(event.target.value)}
              className="rounded-[12px] touch-target w-full border border-z-line bg-white px-3 text-z-ink"
            >
              {!timezone && (
                <option value="">Selecciona una zona horaria</option>
              )}
              {selectedMarket?.timezones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flex gap-3 border-l-4 border-z-ink bg-[#F1F3EF] p-4 text-sm leading-6 text-z-soft">
          <ShieldCheck
            className="mt-0.5 h-5 w-5 shrink-0 text-z-brand-600"
            aria-hidden="true"
          />
          <p>
            {countryCode === "MX" && (
              <>
                La gestión administrativa en México está en validación y es
                independiente de la contratación SaaS. La contratación
                comercial para México aún no está habilitada. No incluye
                funciones federativas mexicanas. Registrar cuotas y pagos
                manuales no emite comprobantes fiscales mexicanos.
              </>
            )}
            {countryCode === "ES" && (
              <>
                Crearemos tu academia y la primera sede de forma segura, y te
                daremos acceso de administración. No importaremos datos de otro
                sistema. {selectedMarket?.sportCoverage.message}
              </>
            )}
            {" "}
            Moneda operativa para cuotas: {selectedMarket?.defaultCurrency};
            independiente de la suscripción a Zaltyko. Zona horaria de la sede:{" "}
            {timezone || "selecciona una zona horaria"}.
          </p>
        </div>
      </fieldset>
      {!activeRetryRequest && contractualConsent?.requiresAcceptance && (
        <label className="flex items-start gap-3 rounded-lg border border-z-line bg-white px-3 py-3 text-sm leading-relaxed text-z-ink">
          <input
            type="checkbox"
            name="contractualAcceptance"
            required
            checked={consentAccepted}
            disabled={previewOnly || fieldsLocked}
            onChange={(event) => setConsentAccepted(event.target.checked)}
            className="mt-0.5 h-5 w-5 accent-z-brand-500"
          />
          <span>
            Acepto los{" "}
            <a
              href="/terminos"
              target="_blank"
              rel="noreferrer"
              className="font-semibold underline"
            >
              términos y condiciones
            </a>{" "}
            y he leído la{" "}
            <a
              href="/politica-privacidad"
              target="_blank"
              rel="noreferrer"
              className="font-semibold underline"
            >
              política de privacidad
            </a>
            .
          </span>
        </label>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-[12px] border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          {error}
        </p>
      )}
      {restorePending && (
        <p role="status" className="text-sm text-z-soft">
          Comprobando si hay un intento pendiente para esta cuenta…
        </p>
      )}
      {persistenceNotice && (
        <p role="status" className="text-sm text-amber-900">
          {persistenceNotice}
        </p>
      )}
      <button
        type="submit"
        disabled={previewOnly || pending || restorePending}
        className="touch-target inline-flex items-center justify-center gap-2 bg-z-ink px-5 py-3 text-sm font-bold text-white hover:bg-black disabled:bg-slate-500"
      >
        {pending
          ? "Creando espacio…"
          : restorePending
            ? "Comprobando intento…"
            : activeRetryRequest
            ? "Reintentar el mismo envío"
            : "Crear espacio de dirección"}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </form>
  );
}
