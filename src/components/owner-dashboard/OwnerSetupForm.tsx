"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { ArrowRight, Building2, MapPin, ShieldCheck } from "lucide-react";

type BootstrapRequest = {
  organizationName: string;
  locationName: string;
  primaryDiscipline: string;
  additionalDisciplines: string[];
  complementaryActivities: string[];
  customActivityName?: string;
  countryCode: "ES";
  contractualAcceptance?: { accepted: true; policyVersion: string };
};

export type OwnerSetupContractualConsent = {
  policyVersion: string;
  requiresAcceptance: boolean;
};

export function OwnerSetupForm({
  contractualConsent,
}: {
  contractualConsent?: OwnerSetupContractualConsent | null;
} = {}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [primaryDiscipline, setPrimaryDiscipline] = useState<
    "artistic" | "rhythmic" | null
  >(null);
  const idempotencyKey = useRef<string | null>(null);
  const [retryRequest, setRetryRequest] = useState<{
    key: string;
    body: BootstrapRequest;
  } | null>(null);

  async function sendBootstrap(key: string, body: BootstrapRequest) {
    setPending(true);
    setError(null);
    setRetryRequest({ key, body });
    let responseFailureMessage: string | null = null;
    try {
      const response = await fetch("/api/v1/organizations/bootstrap", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": key,
        },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const problem = (await response.json().catch(() => null)) as {
          detail?: string;
        } | null;
        if (response.status < 500) {
          idempotencyKey.current = null;
          setRetryRequest(null);
        }
        responseFailureMessage =
          response.status >= 500
            ? "No podemos confirmar si se creó el espacio. Reintenta este mismo envío; conservaremos los datos para evitar duplicados."
            : (problem?.detail ?? "No se ha podido crear el espacio.");
        throw new Error(responseFailureMessage);
      }
      const result = (await response.json()) as { organizationId: string };
      idempotencyKey.current = null;
      setRetryRequest(null);
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
    if (retryRequest) {
      await sendBootstrap(retryRequest.key, retryRequest.body);
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
      countryCode: "ES",
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

  const fieldsLocked = pending || retryRequest !== null;

  if (!contractualConsent) {
    return (
      <p
        role="alert"
        className="mt-8 border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950"
      >
        No pudimos comprobar los términos vigentes de tu cuenta. Recarga la
        página para volver a intentarlo.
      </p>
    );
  }

  return (
    <form onSubmit={submit} aria-busy={pending} className="mt-8 grid gap-6">
      <fieldset disabled={fieldsLocked} className="grid gap-6 border-0 p-0">
        <label className="grid gap-2 text-sm font-bold text-slate-800">
          Nombre de la academia
          <span className="relative">
            <Building2
              className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500"
              aria-hidden="true"
            />
            <input
              name="organizationName"
              required
              minLength={2}
              maxLength={120}
              autoComplete="organization"
              className="touch-target w-full border border-slate-400 bg-white pl-10 pr-3 text-slate-950"
            />
          </span>
        </label>
        <fieldset className="grid gap-3">
          <legend className="text-sm font-bold text-slate-800">
            ¿Cuál es la especialidad principal de tu academia?
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="touch-target flex cursor-pointer items-center gap-3 border border-slate-400 bg-white px-4 py-3 text-sm font-semibold text-slate-900 has-[:checked]:border-teal-800 has-[:checked]:bg-teal-50">
              <input
                type="radio"
                name="primaryDiscipline"
                value="artistic"
                required
                onChange={() => setPrimaryDiscipline("artistic")}
                className="h-5 w-5 accent-teal-800"
              />
              Gimnasia artística
            </label>
            <label className="touch-target flex cursor-pointer items-center gap-3 border border-slate-400 bg-white px-4 py-3 text-sm font-semibold text-slate-900 has-[:checked]:border-teal-800 has-[:checked]:bg-teal-50">
              <input
                type="radio"
                name="primaryDiscipline"
                value="rhythmic"
                required
                onChange={() => setPrimaryDiscipline("rhythmic")}
                className="h-5 w-5 accent-teal-800"
              />
              Gimnasia rítmica
            </label>
          </div>
        </fieldset>
        <details className="border border-slate-300 bg-white">
          <summary className="touch-target cursor-pointer px-4 py-3 text-sm font-semibold text-slate-800">
            Añadir otras disciplinas o actividades (opcional)
          </summary>
          <fieldset className="grid gap-3 border-t border-slate-200 p-4">
            <legend className="px-1 text-sm text-slate-600">
              Puedes añadirlas ahora o más adelante.
            </legend>
            {primaryDiscipline && (
              <label className="touch-target flex cursor-pointer items-start gap-3 border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800">
                <input
                  type="checkbox"
                  name="additionalDisciplines"
                  value={
                    primaryDiscipline === "artistic" ? "rhythmic" : "artistic"
                  }
                  className="mt-0.5 h-5 w-5 accent-teal-800"
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
                  className="touch-target flex cursor-pointer items-center gap-3 border border-slate-300 bg-white px-4 py-3 text-sm text-slate-800"
                >
                  <input
                    type="checkbox"
                    name="complementaryActivities"
                    value={value}
                    className="h-5 w-5 accent-teal-800"
                  />
                  {label}
                </label>
              ))}
            </div>
            <label className="grid gap-2 text-sm font-semibold text-slate-800">
              Otra actividad (opcional)
              <input
                name="customActivityName"
                maxLength={80}
                placeholder="Por ejemplo, acrobacia"
                className="touch-target w-full border border-slate-400 bg-white px-3 text-slate-950"
              />
            </label>
            <p className="text-sm leading-6 text-slate-600">
              Cada actividad tendrá sus propias clases y grupos. Podrás añadir
              más adelante.
            </p>
          </fieldset>
        </details>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-bold text-slate-800">
            Nombre de la primera sede
            <span className="relative">
              <MapPin
                className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-500"
                aria-hidden="true"
              />
              <input
                name="locationName"
                required
                minLength={2}
                maxLength={120}
                placeholder="Sede principal"
                className="touch-target w-full border border-slate-400 bg-white pl-10 pr-3 text-slate-950"
              />
            </span>
          </label>
        </div>
        <div className="flex gap-3 border-l-4 border-teal-800 bg-[#F1F3EF] p-4 text-sm leading-6 text-slate-700">
          <ShieldCheck
            className="mt-0.5 h-5 w-5 shrink-0 text-teal-800"
            aria-hidden="true"
          />
          <p>
            Crearemos tu academia y la primera sede de forma segura, y te
            daremos acceso de administración. La moneda y la zona horaria se
            ajustan automáticamente para España. No importaremos datos de otro
            sistema.
          </p>
        </div>
      </fieldset>
      {contractualConsent.requiresAcceptance && (
        <label className="flex items-start gap-3 rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm leading-relaxed text-slate-800">
          <input
            type="checkbox"
            name="contractualAcceptance"
            required
            checked={consentAccepted}
            disabled={fieldsLocked}
            onChange={(event) => setConsentAccepted(event.target.checked)}
            className="mt-0.5 h-5 w-5 accent-teal-800"
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
          className="border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="touch-target inline-flex items-center justify-center gap-2 bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-teal-900 disabled:bg-slate-500"
      >
        {pending
          ? "Creando espacio…"
          : retryRequest
            ? "Reintentar el mismo envío"
            : "Crear espacio de dirección"}
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </form>
  );
}
