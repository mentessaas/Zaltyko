"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import type { ConnectScreenState } from "@/modules/payments-connect/application/connect-onboarding-service";
import { ownerUi } from "./owner-ui";

// Cobro automático de cuotas (Fase 1): la academia conecta su propia cuenta
// de Stripe. La tarjeta enseña el estado y abre Stripe para conectar, seguir
// o resolver. Con el cobro automático abierto (Fase 3), la página pasa el
// ajuste «Día de cobro» como `children` y se pinta debajo del estado.

// Ruta relativa: el fetch es del mismo origen y el navegador añade la
// cabecera Origin que la API exige en el POST (protección contra CSRF).
const CONNECT_ENDPOINT = "/api/v1/owner/payments/connect";
const SUPPORT_EMAIL = "hola@zaltyko.com";
const STRIPE_DASHBOARD_URL = "https://dashboard.stripe.com/";
const OPEN_STRIPE_ERROR = "No hemos podido abrir Stripe. Inténtalo de nuevo.";

type ProblemBody = { type?: unknown; errors?: { reason?: unknown } | null };

function capabilityText(status: string): string {
  return status === "active" ? "activa" : "pendiente";
}

/** Lee `?stripe=` una sola vez y lo quita de la dirección, sin perder el ancla. */
function takeStripeReturnParam(): string | null {
  if (typeof window === "undefined") return null;
  const url = new URL(window.location.href);
  const value = url.searchParams.get("stripe");
  if (value === null) return null;
  url.searchParams.delete("stripe");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return value;
}

export function OwnerStripeConnectCard({
  organizationId,
  navigate = (url: string) => window.location.assign(url),
  children,
}: {
  organizationId: string;
  /** Solo para pruebas; en la aplicación redirige con `window.location.assign`. */
  navigate?: (url: string) => void;
  /** Ajustes del cobro automático (Fase 3), solo si está abierto. */
  children?: ReactNode;
}) {
  const [state, setState] = useState<ConnectScreenState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [openError, setOpenError] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const load = useCallback(
    async (refresh: boolean) => {
      setLoadFailed(false);
      try {
        const query = new URLSearchParams({ organizationId });
        if (refresh) query.set("refresh", "1");
        const response = await fetch(`${CONNECT_ENDPOINT}?${query.toString()}`, { cache: "no-store" });
        if (!response.ok) {
          setLoadFailed(true);
          return;
        }
        setState((await response.json()) as ConnectScreenState);
      } catch {
        setLoadFailed(true);
      }
    },
    [organizationId]
  );

  useEffect(() => {
    const stripeParam = takeStripeReturnParam();
    if (stripeParam === "error") setOpenError(true);
    void load(stripeParam === "vuelta");
  }, [load]);

  async function openStripe() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setOpenError(false);
    try {
      const response = await fetch(CONNECT_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId }),
      });
      if (response.ok) {
        const body = (await response.json().catch(() => null)) as { url?: unknown } | null;
        if (typeof body?.url === "string" && body.url) {
          // La página se va a Stripe: el botón sigue desactivado hasta entonces.
          navigate(body.url);
          return;
        }
      } else if (response.status === 409) {
        const problem = (await response.json().catch(() => null)) as ProblemBody | null;
        const reason = problem?.errors?.reason;
        if (
          typeof problem?.type === "string" &&
          problem.type.endsWith("/connect-unavailable") &&
          typeof reason === "string"
        ) {
          setState({ kind: "unavailable", reason: reason as Extract<ConnectScreenState, { kind: "unavailable" }>["reason"] });
          busyRef.current = false;
          setBusy(false);
          return;
        }
      }
      setOpenError(true);
    } catch {
      setOpenError(true);
    }
    busyRef.current = false;
    setBusy(false);
  }

  if (state?.kind === "unavailable" && state.reason !== "paid_plan_required" && state.reason !== "country_not_supported") {
    return null;
  }

  return (
    <section id="cobro-automatico" className={ownerUi.card} aria-labelledby="cobro-automatico-title">
      <h2 id="cobro-automatico-title" className={ownerUi.sectionTitle}>Cobro automático de cuotas</h2>
      <div className="mt-4 grid gap-4">
        {openError ? (
          <div className={ownerUi.noticeError} role="alert">
            <p>{OPEN_STRIPE_ERROR}</p>
          </div>
        ) : null}
        <CardBody
          state={state}
          loadFailed={loadFailed}
          busy={busy}
          organizationId={organizationId}
          collectionOpen={Boolean(children)}
          onOpen={() => void openStripe()}
          onRetry={() => void load(false)}
        />
        {children && state && state.kind !== "unavailable" && !loadFailed ? (
          <div className="border-t border-z-line pt-4">{children}</div>
        ) : null}
      </div>
    </section>
  );
}

function OpenStripeButton({ label, busy, onOpen }: { label: string; busy: boolean; onOpen: () => void }) {
  return (
    <div>
      <button type="button" className={ownerUi.primaryButton} onClick={onOpen} disabled={busy} aria-busy={busy || undefined}>
        {label}
      </button>
    </div>
  );
}

function CardBody({
  state,
  loadFailed,
  busy,
  organizationId,
  collectionOpen,
  onOpen,
  onRetry,
}: {
  state: ConnectScreenState | null;
  loadFailed: boolean;
  busy: boolean;
  organizationId: string;
  /** El cobro automático de cuotas ya funciona (Fase 3). */
  collectionOpen: boolean;
  onOpen: () => void;
  onRetry: () => void;
}) {
  if (loadFailed) {
    return (
      <div className={ownerUi.noticeError} role="alert">
        <p>No hemos podido cargar el cobro automático. Inténtalo de nuevo.</p>
        <button type="button" className={`${ownerUi.secondaryButton} mt-3`} onClick={onRetry}>
          Reintentar
        </button>
      </div>
    );
  }
  if (!state) return <p className={ownerUi.muted} role="status">Cargando…</p>;

  switch (state.kind) {
    case "not_connected":
      return (
        <>
          <p className={ownerUi.muted}>
            Conecta tu cuenta de Stripe para que las cuotas se cobren solas. El dinero llega directo a tu cuenta.
          </p>
          <OpenStripeButton label="Conectar Stripe" busy={busy} onOpen={onOpen} />
          <p className={ownerUi.help}>
            Stripe te pedirá los datos de tu academia y tu cuenta bancaria. Zaltyko no se queda ninguna comisión.
          </p>
        </>
      );
    case "needs_details":
      return (
        <>
          <p className={ownerUi.muted}>Stripe necesita más datos de tu academia.</p>
          <OpenStripeButton label="Seguir en Stripe" busy={busy} onOpen={onOpen} />
        </>
      );
    case "in_review":
      return (
        <div className={ownerUi.noticeWarning} role="status">
          <p>Stripe está revisando tus datos. Te avisaremos aquí cuando esté lista.</p>
        </div>
      );
    case "ready":
      return (
        <>
          <div className={ownerUi.noticeInfo} role="status">
            <p className="font-semibold">Lista para cobrar.</p>
            <p>{`Tarjeta: ${capabilityText(state.card)} · Domiciliación: ${capabilityText(state.sepa)}`}</p>
          </div>
          <div>
            <a href={STRIPE_DASHBOARD_URL} target="_blank" rel="noopener noreferrer" className={ownerUi.secondaryButton}>
              Abrir mi panel de Stripe{" "}
              {/* El espacio va fuera del span: el nombre accesible recorta el texto de cada elemento hijo. */}
              <span className="sr-only">(se abre en otra pestaña)</span>
            </a>
          </div>
          {collectionOpen ? null : (
            <p className={ownerUi.help}>El cobro automático de cuotas a las familias llegará en una próxima actualización.</p>
          )}
        </>
      );
    case "problem":
      return state.disabled ? (
        <div className={ownerUi.noticeError} role="alert">
          <p>
            Esta cuenta está cerrada. Escríbenos a{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="font-semibold underline">
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </div>
      ) : (
        <>
          <div className={ownerUi.noticeWarning} role="status">
            <p>Stripe ha encontrado un problema con tu cuenta.</p>
          </div>
          <OpenStripeButton label="Resolverlo en Stripe" busy={busy} onOpen={onOpen} />
        </>
      );
    case "unavailable":
      return state.reason === "paid_plan_required" ? (
        <>
          <p className={ownerUi.muted}>El cobro automático está incluido en Starter y Growth.</p>
          <div>
            <Link href={`/owner/subscription?organizationId=${encodeURIComponent(organizationId)}`} className={ownerUi.secondaryButton}>
              Ver planes
            </Link>
          </div>
        </>
      ) : (
        <p className={ownerUi.muted}>
          El cobro automático llegará más adelante a tu país. Mientras tanto, registra los pagos a mano.
        </p>
      );
  }
}
