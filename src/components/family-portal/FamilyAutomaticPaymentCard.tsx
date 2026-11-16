"use client";

import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { Stripe, StripeError } from "@stripe/stripe-js";
// Sin efectos al importar: Stripe.js solo se descarga cuando la familia abre el formulario.
import { loadStripe } from "@stripe/stripe-js/pure";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";

import { ownerTone, ownerUi } from "@/components/owner-dashboard/owner-ui";
import type { FamilyPaymentMethodState } from "@/modules/family-payment-methods/application/family-payment-methods-service";
import type { PaymentMethodKind } from "@/modules/family-payment-methods/domain/consent";

// Pago automático de cuotas (cobro automático, Fase 2): la persona pagadora
// guarda una tarjeta o domicilia el pago en la cuenta Stripe de su academia.
// En esta fase no se cobra nada. La tarjeta nunca enseña códigos de Stripe ni
// la clave secreta del formulario.

/** Lo que la página pasa a la vista de cuotas: por academia, una tarjeta por familia que paga. */
export type FamilyAutomaticPaymentCards = Record<
  string,
  Array<{ familyId: string; state: FamilyPaymentMethodState }>
>;

// Ruta relativa: mismo origen, el navegador añade la cabecera Origin que la API exige.
const ENDPOINT = "/api/v1/family/payment-methods";
const RETURN_PATH = "/familia/cuotas";
const RETURN_PARAMS = [
  "pago",
  "organizationId",
  "familyId",
  "setup_intent",
  "setup_intent_client_secret",
  "redirect_status",
] as const;

const TEXT = {
  title: "Pago automático",
  intro:
    "Guarda una tarjeta o domicilia el pago para que las cuotas se cobren solas. Todavía no se cobrará nada.",
  unavailable: "El pago automático no está disponible ahora mismo",
  pending:
    "Tu banco todavía lo está confirmando. Si en unos minutos no aparece como guardado, vuelve a guardarlo.",
  checking: "Estamos comprobando el método de pago…",
  revoked: "Ya no pagas automáticamente.",
  revokeQuestion:
    "Las cuotas dejarán de cobrarse solas y tendrás que pagarlas directamente a tu academia. ¿Quieres dejar de pagar automáticamente?",
  saveFailed: "No se pudo guardar el método de pago. Vuelve a intentarlo.",
  revokeFailed: "No se pudo dejar de pagar automáticamente. Vuelve a intentarlo en un momento.",
  revokeUnavailable:
    "Ahora mismo no se puede dejar de pagar automáticamente desde aquí. Habla con tu academia.",
  notOffered: "Tu academia no acepta ahora mismo este método de pago.",
  notFound: "No encontramos este pago automático. Recarga la página.",
  consentRequired: "Recarga la página, lee el texto y vuelve a aceptarlo.",
  session: "Tu sesión ha caducado. Vuelve a entrar para continuar.",
  tooMany: "Has hecho demasiados intentos. Espera un minuto y vuelve a intentarlo.",
  bankRejected: "Tu banco no ha aceptado este método de pago. Prueba con otro o habla con tu banco.",
  checkForm: "Revisa los datos del formulario.",
} as const;

const KIND_LABEL: Record<PaymentMethodKind, string> = {
  card: "Tarjeta",
  sepa_debit: "Domiciliación bancaria",
};

const ACTIVE_LABEL: Record<PaymentMethodKind, string> = {
  card: "Pagas automáticamente con tarjeta",
  sepa_debit: "Pagas automáticamente con domiciliación bancaria",
};

const SAVED_LABEL: Record<PaymentMethodKind, string> = {
  card: "Tarjeta guardada",
  sepa_debit: "Domiciliación guardada",
};

type Action = "save" | "revoke";
type PostResult<T> = { ok: true; data: T } | { ok: false; status: number; code: string | null };

function isKind(value: unknown): value is PaymentMethodKind {
  return value === "card" || value === "sepa_debit";
}

async function post<T>(body: Record<string, unknown>): Promise<PostResult<T>> {
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const json = (await response.json().catch(() => null)) as
      | { ok?: unknown; data?: unknown; code?: unknown; error?: unknown }
      | null;
    if (response.ok && json?.ok === true && json.data && typeof json.data === "object") {
      return { ok: true, data: json.data as T };
    }
    const code = typeof json?.code === "string" ? json.code : typeof json?.error === "string" ? json.error : null;
    return { ok: false, status: response.status, code };
  } catch {
    return { ok: false, status: 0, code: null };
  }
}

/** Mensaje sencillo para cada fallo; nunca se enseña lo que dice el servidor ni Stripe. */
function failureMessage(result: { status: number; code: string | null }, action: Action): string {
  if (result.status === 429) return TEXT.tooMany;
  if (result.status === 401) return TEXT.session;
  switch (result.code) {
    case "FAMILY_PAYMENT_METHOD_NOT_OFFERED":
      return TEXT.notOffered;
    case "NOT_FOUND":
      return TEXT.notFound;
    case "FAMILY_PAYMENT_CONSENT_REQUIRED":
      return TEXT.consentRequired;
    case "FAMILY_PAYMENT_REVOKE_FAILED":
      return TEXT.revokeFailed;
    case "FEATURE_NOT_AVAILABLE":
      return action === "revoke" ? TEXT.revokeUnavailable : `${TEXT.unavailable}.`;
    default:
      return action === "revoke" ? TEXT.revokeFailed : TEXT.saveFailed;
  }
}

function stripeErrorMessage(error: StripeError): string {
  if (error.type === "card_error") return TEXT.bankRejected;
  if (error.type === "validation_error") return TEXT.checkForm;
  return TEXT.saveFailed;
}

function formatSince(isoInstant: string, timeZone: string): string {
  const date = new Date(isoInstant);
  const format = (zone: string) =>
    new Intl.DateTimeFormat("es-ES", { timeZone: zone, day: "numeric", month: "long", year: "numeric" }).format(date);
  try {
    return format(timeZone);
  } catch {
    return format("UTC");
  }
}

// Un Stripe.js por cuenta conectada: el de la plataforma (getStripe) no sirve aquí.
const stripePromises = new Map<string, Promise<Stripe | null>>();

function stripeForAccount(publishableKey: string, stripeAccount: string): Promise<Stripe | null> {
  const key = `${publishableKey}:${stripeAccount}`;
  let promise = stripePromises.get(key);
  if (!promise) {
    promise = loadStripe(publishableKey, { stripeAccount })
      .catch(() => null)
      .then((stripe) => {
        // Si no cargó, el siguiente intento vuelve a probar.
        if (!stripe) stripePromises.delete(key);
        return stripe;
      });
    stripePromises.set(key, promise);
  }
  return promise;
}

function returnUrlFor(organizationId: string, familyId: string): string {
  const query = new URLSearchParams({ pago: "vuelta", organizationId, familyId });
  return `${window.location.origin}${RETURN_PATH}?${query.toString()}`;
}

type ReturnVisit = { setupIntentId: string | null; failed: boolean };

/**
 * Vuelta de la confirmación del banco: si la dirección es de esta academia y
 * esta familia, devuelve la referencia y si el banco la rechazó
 * (`redirect_status=failed`), y limpia la dirección (una sola vez).
 */
function takeReturnVisit(organizationId: string, familyId: string): ReturnVisit | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const params = url.searchParams;
  if (params.get("pago") !== "vuelta") return null;
  if (params.get("organizationId") !== organizationId || params.get("familyId") !== familyId) return null;
  const setupIntentId = params.get("setup_intent");
  // Se lee antes de limpiar la dirección.
  const failed = params.get("redirect_status") === "failed";
  for (const name of RETURN_PARAMS) params.delete(name);
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return {
    setupIntentId: setupIntentId && /^seti_[A-Za-z0-9]+$/.test(setupIntentId) ? setupIntentId : null,
    failed,
  };
}

type Mode = "idle" | "choose" | "form" | "checking" | "pending";
type ActiveMethod = { kind: PaymentMethodKind; since: string };
type SetupSession = { kind: PaymentMethodKind; clientSecret: string; connectedAccount: string };

export function FamilyAutomaticPaymentCard({
  organizationId,
  familyId,
  timezone,
  state,
}: {
  organizationId: string;
  familyId: string;
  timezone: string;
  state: FamilyPaymentMethodState;
}) {
  const titleId = useId();
  const publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? "";
  const kinds = state.kind === "unavailable" ? [] : state.kinds;
  const consentTexts = state.kind === "unavailable" ? {} : state.consentTexts;
  const consentVersion = state.kind === "unavailable" ? "" : state.consentVersion;

  const [method, setMethod] = useState<ActiveMethod | null>(
    state.kind === "active" ? { kind: state.method, since: state.since } : null
  );
  const [mode, setMode] = useState<Mode>("idle");
  const [session, setSession] = useState<SetupSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const returnHandled = useRef(false);

  const complete = useCallback(
    async (setupIntentId: string) => {
      setMode("checking");
      setError(null);
      setSuccess(null);
      const result = await post<{ outcome?: unknown; method?: unknown }>({
        action: "complete",
        organizationId,
        familyId,
        setupIntentId,
      });
      setSession(null);
      if (!result.ok) {
        setError(failureMessage(result, "save"));
        setMode("idle");
        return;
      }
      if (result.data.outcome === "active" && isKind(result.data.method)) {
        const kind = result.data.method;
        setMethod({ kind, since: new Date().toISOString() });
        setSuccess(SAVED_LABEL[kind]);
        setMode("idle");
        return;
      }
      setMode("pending");
    },
    [organizationId, familyId]
  );

  useEffect(() => {
    if (returnHandled.current) return;
    const visit = takeReturnVisit(organizationId, familyId);
    if (!visit) return;
    returnHandled.current = true;
    // El banco no aceptó la confirmación: no es «pendiente» y no se comprueba.
    if (visit.failed) {
      setError(TEXT.bankRejected);
      return;
    }
    if (visit.setupIntentId) void complete(visit.setupIntentId);
  }, [organizationId, familyId, complete]);

  async function startSetup(kind: PaymentMethodKind) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setSuccess(null);
    const result = await post<{ clientSecret?: unknown; connectedAccount?: unknown }>({
      action: "setup",
      organizationId,
      familyId,
      kind,
      consentVersion,
      consentAccepted: true,
    });
    const done = () => {
      busyRef.current = false;
      setBusy(false);
    };
    if (!result.ok) {
      done();
      setError(failureMessage(result, "save"));
      return;
    }
    const { clientSecret, connectedAccount } = result.data;
    if (
      typeof clientSecret !== "string" ||
      clientSecret.length === 0 ||
      typeof connectedAccount !== "string" ||
      !connectedAccount.startsWith("acct_")
    ) {
      done();
      setError(TEXT.saveFailed);
      return;
    }
    // Si Stripe.js no carga, se dice aquí en vez de dejar «Guardar» desactivado sin explicación.
    const stripe = await stripeForAccount(publishableKey, connectedAccount);
    done();
    if (!stripe) {
      setError(`${TEXT.unavailable}.`);
      return;
    }
    setSession({ kind, clientSecret, connectedAccount });
    setMode("form");
  }

  async function revoke() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    setSuccess(null);
    const result = await post<{ outcome?: unknown }>({ action: "revoke", organizationId, familyId });
    busyRef.current = false;
    setBusy(false);
    if (!result.ok) {
      setError(failureMessage(result, "revoke"));
      return;
    }
    setConfirmingRevoke(false);
    setMethod(null);
    setMode("idle");
    setSuccess(TEXT.revoked);
  }

  if (state.kind === "unavailable") return null;

  const canChoose = publishableKey.length > 0 && kinds.length > 0;

  let body: ReactNode;
  if (mode === "checking") {
    body = (
      <p className={ownerUi.muted} role="status">
        {TEXT.checking}
      </p>
    );
  } else if (mode === "pending") {
    body = (
      <p className={ownerTone.noticeWarning} role="status">
        {TEXT.pending}
      </p>
    );
  } else if (mode === "form" && session && publishableKey) {
    body = (
      <Elements
        key={session.clientSecret}
        stripe={stripeForAccount(publishableKey, session.connectedAccount)}
        options={{ clientSecret: session.clientSecret, locale: "es" }}
      >
        <SetupForm
          returnUrl={returnUrlFor(organizationId, familyId)}
          onConfirmed={complete}
          onError={setError}
          onCancel={() => {
            setSession(null);
            setError(null);
            setMode(method ? "idle" : "choose");
          }}
        />
      </Elements>
    );
  } else if (method && mode !== "choose") {
    body = (
      <ActiveView
        method={method}
        timezone={timezone}
        canChange={canChoose}
        busy={busy}
        confirmingRevoke={confirmingRevoke}
        onChange={() => {
          setError(null);
          setSuccess(null);
          setConfirmingRevoke(false);
          setMode("choose");
        }}
        onAskRevoke={() => {
          setError(null);
          setSuccess(null);
          setConfirmingRevoke(true);
        }}
        onCancelRevoke={() => setConfirmingRevoke(false)}
        onRevoke={() => void revoke()}
      />
    );
  } else if (!publishableKey) {
    body = <p className={ownerUi.muted}>{`${TEXT.unavailable}.`}</p>;
  } else if (kinds.length === 0) {
    body = null;
  } else {
    body = (
      <ChooseView
        kinds={kinds}
        consentTexts={consentTexts}
        busy={busy}
        onContinue={(kind) => void startSetup(kind)}
        onCancel={
          method
            ? () => {
                setError(null);
                setMode("idle");
              }
            : null
        }
      />
    );
  }

  return (
    <section className={ownerTone.innerPanel} aria-labelledby={titleId}>
      <h3 id={titleId} className="font-display text-lg font-black uppercase leading-none text-z-ink">
        {TEXT.title}
      </h3>
      <div className="mt-3 grid gap-3">
        {success ? (
          <p className={`${ownerTone.chipSuccess} justify-self-start`} role="status">
            {success}
          </p>
        ) : null}
        {error ? (
          <div className={ownerUi.noticeError} role="alert">
            <p>{error}</p>
          </div>
        ) : null}
        {body}
      </div>
    </section>
  );
}

function ActiveView({
  method,
  timezone,
  canChange,
  busy,
  confirmingRevoke,
  onChange,
  onAskRevoke,
  onCancelRevoke,
  onRevoke,
}: {
  method: ActiveMethod;
  timezone: string;
  canChange: boolean;
  busy: boolean;
  confirmingRevoke: boolean;
  onChange: () => void;
  onAskRevoke: () => void;
  onCancelRevoke: () => void;
  onRevoke: () => void;
}) {
  return (
    <>
      <p className="text-sm font-semibold leading-6 text-z-ink">
        {`${ACTIVE_LABEL[method.kind]} desde el ${formatSince(method.since, timezone)}.`}
      </p>
      {confirmingRevoke ? (
        <div className={ownerUi.noticeWarning}>
          <p>{TEXT.revokeQuestion}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className={ownerTone.dangerButton}
              onClick={onRevoke}
              disabled={busy}
              aria-busy={busy || undefined}
            >
              Sí, dejar de pagar automáticamente
            </button>
            <button type="button" className={ownerUi.secondaryButton} onClick={onCancelRevoke} disabled={busy}>
              No, seguir igual
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {canChange ? (
            <button type="button" className={ownerUi.secondaryButton} onClick={onChange}>
              Cambiar método
            </button>
          ) : null}
          <button type="button" className={ownerTone.dangerOutlineButton} onClick={onAskRevoke}>
            Dejar de pagar automáticamente
          </button>
        </div>
      )}
    </>
  );
}

function ChooseView({
  kinds,
  consentTexts,
  busy,
  onContinue,
  onCancel,
}: {
  kinds: PaymentMethodKind[];
  consentTexts: Partial<Record<PaymentMethodKind, string>>;
  busy: boolean;
  onContinue: (kind: PaymentMethodKind) => void;
  onCancel: (() => void) | null;
}) {
  const baseId = useId();
  const [kind, setKind] = useState<PaymentMethodKind>(kinds[0]);
  const [accepted, setAccepted] = useState(false);
  const consentText = consentTexts[kind] ?? "";
  const consentId = `${baseId}-consent`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accepted || !consentText || busy) return;
    onContinue(kind);
  }

  return (
    <form className="grid gap-4" onSubmit={submit}>
      <p className={ownerUi.muted}>{TEXT.intro}</p>
      <fieldset className="grid gap-2">
        <legend className={ownerUi.label}>¿Cómo quieres pagar?</legend>
        {kinds.map((option) => (
          <label key={option} className="flex min-h-11 items-center gap-3 text-sm text-z-ink">
            <input
              type="radio"
              name={`${baseId}-kind`}
              value={option}
              checked={kind === option}
              onChange={() => {
                setKind(option);
                // Cada método tiene su propio texto: hay que aceptarlo de nuevo.
                setAccepted(false);
              }}
              className="h-4 w-4 accent-z-brand-500"
            />
            {KIND_LABEL[option]}
          </label>
        ))}
      </fieldset>
      {consentText ? (
        <p id={consentId} className={ownerUi.subtlePanel}>
          {consentText}
        </p>
      ) : null}
      <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-z-ink">
        <input
          type="checkbox"
          checked={accepted}
          onChange={(event) => setAccepted(event.target.checked)}
          aria-describedby={consentText ? consentId : undefined}
          disabled={!consentText}
          className="h-4 w-4 accent-z-brand-500"
        />
        Acepto
      </label>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className={ownerUi.primaryButton}
          disabled={!accepted || !consentText || busy}
          aria-busy={busy || undefined}
        >
          Continuar
        </button>
        {onCancel ? (
          <button type="button" className={ownerUi.secondaryButton} onClick={onCancel} disabled={busy}>
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );
}

function SetupForm({
  returnUrl,
  onConfirmed,
  onError,
  onCancel,
}: {
  returnUrl: string;
  onConfirmed: (setupIntentId: string) => Promise<void>;
  onError: (message: string | null) => void;
  onCancel: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stripe || !elements || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    onError(null);
    try {
      const result = await stripe.confirmSetup({
        elements,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      });
      if (result.error) {
        onError(stripeErrorMessage(result.error));
      } else {
        // El formulario se cierra al comprobarlo; no se vuelve a activar.
        await onConfirmed(result.setupIntent.id);
        return;
      }
    } catch {
      onError(TEXT.saveFailed);
    }
    busyRef.current = false;
    setBusy(false);
  }

  return (
    <form className="grid gap-4" onSubmit={save}>
      <PaymentElement />
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          className={ownerUi.primaryButton}
          disabled={!stripe || !elements || busy}
          aria-busy={busy || undefined}
        >
          Guardar
        </button>
        <button type="button" className={ownerUi.secondaryButton} onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
