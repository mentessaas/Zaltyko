"use client";

import { useRef, useState } from "react";

import { ownerTone, ownerUi } from "@/components/owner-dashboard/owner-ui";
import type { listOwnerFamilyPaymentMethods } from "@/modules/family-payment-methods/application/family-payment-methods-service";
import type { PaymentMethodKind } from "@/modules/family-payment-methods/domain/consent";

// Pago automático de las familias (cobro automático, Fase 2): la academia ve
// qué familias han guardado tarjeta o domiciliación y puede dejar de cobrarles
// automáticamente. En esta fase todavía no se cobra nada.

// Ruta relativa: el fetch es del mismo origen y el navegador añade la cabecera
// Origin que la API exige en el POST (protección contra CSRF).
const REVOKE_ENDPOINT = "/api/v1/owner/payments/family-methods";
const REVOKE_ERROR = "No hemos podido dejar de cobrar automáticamente a esta familia. Inténtalo de nuevo.";

export type OwnerFamilyPaymentMethod = Awaited<ReturnType<typeof listOwnerFamilyPaymentMethods>>[number];

const METHOD_LABELS: Record<PaymentMethodKind, string> = {
  card: "Tarjeta",
  sepa_debit: "Domiciliación bancaria",
};

// Zona fija: el servidor y el navegador pintan la misma fecha (sin saltos al
// hidratar la página).
const dateFormat = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Madrid",
});

function sinceText(since: string): string | null {
  const date = new Date(since);
  return Number.isNaN(date.getTime()) ? null : `desde el ${dateFormat.format(date)}`;
}

type RevokeBody = { data?: { outcome?: unknown } | null; outcome?: unknown; detail?: unknown; message?: unknown };

/** Mensaje de error de la API (`detail` del problema; `message` por si acaso), si viene en texto. */
function errorText(body: RevokeBody | null): string {
  if (typeof body?.detail === "string" && body.detail.trim()) return body.detail;
  if (typeof body?.message === "string" && body.message.trim()) return body.message;
  return REVOKE_ERROR;
}

export function OwnerFamilyPaymentMethodsPanel({
  organizationId,
  methods: serverMethods,
}: {
  organizationId: string;
  methods: OwnerFamilyPaymentMethod[];
}) {
  const [methods, setMethods] = useState(serverMethods);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  async function revoke(method: OwnerFamilyPaymentMethod) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    let failure: string | null = REVOKE_ERROR;
    let outcome: unknown = null;
    try {
      const response = await fetch(REVOKE_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId, authorizationId: method.authorizationId }),
      });
      const body = (await response.json().catch(() => null)) as RevokeBody | null;
      if (response.ok) {
        // La ruta responde `{ outcome }`; se acepta también el sobre `{ data }`.
        outcome = body?.outcome ?? body?.data?.outcome;
        failure = outcome === "revoked" || outcome === "none" ? null : REVOKE_ERROR;
      } else {
        failure = errorText(body);
      }
    } catch {
      failure = REVOKE_ERROR;
    }
    busyRef.current = false;
    setBusy(false);
    if (failure) {
      setMessage({ tone: "error", text: failure });
      return;
    }
    setConfirming(null);
    setMethods((current) => current.filter((item) => item.authorizationId !== method.authorizationId));
    setMessage({
      tone: "info",
      text:
        outcome === "revoked"
          ? `Ya no se cobrará automáticamente a ${method.payerName}.`
          : `${method.payerName} ya no tenía el pago automático activo.`,
    });
  }

  return (
    <section id="pago-automatico-familias" className={ownerUi.card} aria-labelledby="pago-automatico-familias-title">
      <h2 id="pago-automatico-familias-title" className={ownerUi.sectionTitle}>Pago automático de las familias</h2>
      <p className={`${ownerUi.help} mt-2`}>Revocar no anula los cobros ya enviados.</p>

      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={`${message.tone === "error" ? ownerUi.noticeError : ownerUi.noticeInfo} mt-4`}>
          {message.text}
        </p>
      ) : null}

      {methods.length === 0 ? (
        <p className={`${ownerUi.muted} mt-5`}>Ninguna familia ha guardado todavía un método de pago.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {methods.map((method) => {
            const since = sinceText(method.since);
            return (
              <li key={method.authorizationId} className={ownerUi.listItem}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-z-ink">{method.payerName}</p>
                    <p className="mt-2 flex flex-wrap items-center gap-2">
                      <span className={ownerTone.chipOutline}>{METHOD_LABELS[method.method]}</span>
                      {since ? <span className={ownerUi.help}>{since}</span> : null}
                    </p>
                  </div>
                  {confirming !== method.authorizationId ? (
                    <button
                      type="button"
                      className={ownerTone.dangerOutlineButton}
                      disabled={busy}
                      aria-label={`Dejar de cobrar automáticamente a ${method.payerName}`}
                      onClick={() => {
                        setMessage(null);
                        setConfirming(method.authorizationId);
                      }}
                    >
                      Dejar de cobrar automáticamente
                    </button>
                  ) : null}
                </div>
                {confirming === method.authorizationId ? (
                  <div className={`${ownerUi.subtlePanel} mt-3`} role="group" aria-label={`Confirmar que dejas de cobrar automáticamente a ${method.payerName}`}>
                    <p className="text-sm text-z-ink">
                      ¿Dejar de cobrar automáticamente a {method.payerName}? Tendrá que volver a guardar su método de pago si quiere pagar así otra vez. Revocar no anula los cobros ya enviados.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" className={ownerTone.dangerButton} disabled={busy} aria-busy={busy || undefined} onClick={() => void revoke(method)}>
                        {busy ? "Guardando…" : "Sí, dejar de cobrar"}
                      </button>
                      <button type="button" className={ownerUi.secondaryButton} disabled={busy} onClick={() => setConfirming(null)}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
