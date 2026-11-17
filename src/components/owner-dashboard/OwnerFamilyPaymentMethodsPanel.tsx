"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ownerTone, ownerUi } from "@/components/owner-dashboard/owner-ui";
import { Switch } from "@/components/ui/switch";
import type {
  OwnerFamilyCollectionSwitch,
  OwnerFamilyCollectionSwitches,
} from "@/modules/family-collection/application/family-collection-reads";
import type { listOwnerFamilyPaymentMethods } from "@/modules/family-payment-methods/application/family-payment-methods-service";
import type { PaymentMethodKind } from "@/modules/family-payment-methods/domain/consent";

// Pago automático de las familias (cobro automático, Fase 2): la academia ve
// qué familias han guardado tarjeta o domiciliación y puede dejar de cobrarles
// automáticamente. Con el cobro automático abierto (Fase 3), cada familia con
// método activo tiene además el interruptor «Cobrar automáticamente», que
// guarda su preferencia de cobro (el único interruptor para eso).

// Ruta relativa: el fetch es del mismo origen y el navegador añade la cabecera
// Origin que la API exige en el POST (protección contra CSRF).
const REVOKE_ENDPOINT = "/api/v1/owner/payments/family-methods";
const REVOKE_ERROR = "No hemos podido dejar de cobrar automáticamente a esta familia. Inténtalo de nuevo.";
const PREFERENCE_ENDPOINT = "/api/v1/owner/billing/family-collection-preference";
const PREFERENCE_ERROR = "No hemos podido guardar el cambio. Inténtalo de nuevo.";
const SENT_CONTINUE = "Los cobros ya enviados al banco siguen su curso.";

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

type RevokeBody = {
  data?: { outcome?: unknown } | null;
  outcome?: unknown;
  detail?: unknown;
  message?: unknown;
  type?: unknown;
};

/** ¿Es el 409 de versión (`…/problems/version-conflict`)? Otra sesión guardó antes. */
function isVersionConflict(status: number, body: RevokeBody | null): boolean {
  return status === 409 && typeof body?.type === "string" && body.type.split("/").pop() === "version-conflict";
}

/** Mensaje de error de la API (`detail` del problema; `message` por si acaso), si viene en texto. */
function errorText(body: RevokeBody | null, fallback: string = REVOKE_ERROR): string {
  if (typeof body?.detail === "string" && body.detail.trim()) return body.detail;
  if (typeof body?.message === "string" && body.message.trim()) return body.message;
  return fallback;
}

type PreferenceReceipt = {
  familyId?: unknown;
  effectiveMode?: unknown;
  version?: unknown;
  requiresConfirmation?: unknown;
};

/** Envío pendiente de confirmar: un reintento usa la misma clave y el mismo contenido. */
type PendingPreference = { familyId: string; automatic: boolean; expectedVersion: number; key: string };

export function OwnerFamilyPaymentMethodsPanel({
  organizationId,
  methods: serverMethods,
  collection,
}: {
  organizationId: string;
  methods: OwnerFamilyPaymentMethod[];
  /** Interruptores «Cobrar automáticamente» (Fase 3), solo con el cobro automático abierto. */
  collection?: OwnerFamilyCollectionSwitches;
}) {
  const router = useRouter();
  const [methods, setMethods] = useState(serverMethods);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [switches, setSwitches] = useState<Record<string, OwnerFamilyCollectionSwitch>>(collection?.families ?? {});
  const [savingFamily, setSavingFamily] = useState<string | null>(null);
  const savingRef = useRef(false);
  const pendingRef = useRef<PendingPreference | null>(null);

  // Tras router.refresh() (p. ej. por un conflicto de versión) llega la
  // lectura nueva del servidor: manda sobre los interruptores de esta pantalla.
  useEffect(() => {
    setSwitches(collection?.families ?? {});
  }, [collection]);

  async function setAutomatic(method: OwnerFamilyPaymentMethod, automatic: boolean) {
    const current = switches[method.familyId];
    if (savingRef.current || !current) return;
    savingRef.current = true;
    setSavingFamily(method.familyId);
    setMessage(null);
    const previous = pendingRef.current;
    const pending: PendingPreference =
      previous &&
      previous.familyId === method.familyId &&
      previous.automatic === automatic &&
      previous.expectedVersion === current.version
        ? previous
        : {
            familyId: method.familyId,
            automatic,
            expectedVersion: current.version,
            key: `family-preference-${crypto.randomUUID()}`,
          };
    pendingRef.current = pending;
    let failure: string | null = PREFERENCE_ERROR;
    try {
      const response = await fetch(PREFERENCE_ENDPOINT, {
        method: "PUT",
        headers: { "content-type": "application/json", "idempotency-key": pending.key },
        body: JSON.stringify({
          organizationId,
          familyId: method.familyId,
          mode: automatic ? "automatic" : "manual",
          expectedVersion: pending.expectedVersion,
        }),
      });
      const body = (await response.json().catch(() => null)) as (PreferenceReceipt & RevokeBody) | null;
      if (
        response.ok &&
        body?.familyId === method.familyId &&
        typeof body.version === "number" &&
        Number.isInteger(body.version)
      ) {
        const next: OwnerFamilyCollectionSwitch = {
          automatic: body.effectiveMode === "automatic",
          version: body.version,
          requiresConfirmation: body.requiresConfirmation === true,
        };
        setSwitches((all) => ({ ...all, [method.familyId]: next }));
        pendingRef.current = null;
        failure = null;
        setMessage({
          tone: "info",
          text: next.automatic
            ? `Las próximas cuotas de ${method.payerName} se cobrarán automáticamente.`
            : `Las cuotas de ${method.payerName} ya no se cobrarán automáticamente. ${SENT_CONTINUE}`,
        });
      } else if (!response.ok) {
        // Rechazo definitivo (4xx): el siguiente intento lleva otra clave.
        if (response.status < 500) pendingRef.current = null;
        failure = errorText(body, PREFERENCE_ERROR);
        // Otra sesión cambió la preferencia: se relee la página con la versión nueva.
        if (isVersionConflict(response.status, body)) router.refresh();
      }
    } catch {
      failure = PREFERENCE_ERROR;
    }
    savingRef.current = false;
    setSavingFamily(null);
    if (failure) setMessage({ tone: "error", text: failure });
  }

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
      {collection ? (
        <p className={`${ownerUi.help} mt-1`}>
          Con «Cobrar automáticamente» encendido, las próximas cuotas de la familia se cobran solas. Al apagarlo, no se cobra ninguna cuota más de forma automática. {SENT_CONTINUE}
        </p>
      ) : null}
      {collection && !collection.available ? (
        <p className={`${ownerUi.noticeWarning} mt-4`}>
          El cobro automático de cuotas está incluido en Starter y Growth.
        </p>
      ) : null}

      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={`${message.tone === "error" ? ownerUi.noticeError : ownerUi.noticeInfo} mt-4`}>
          {message.text}
        </p>
      ) : null}

      {methods.length === 0 ? (
        <p className={`${ownerUi.muted} mt-5`}>Ninguna familia ha guardado todavía un método de pago.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {methods.map((method, index) => {
            const since = sinceText(method.since);
            // Un interruptor por familia: en su primera fila, aunque tenga más de un método.
            const firstOfFamily = methods.findIndex((item) => item.familyId === method.familyId) === index;
            const preference = collection && firstOfFamily ? switches[method.familyId] : undefined;
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
                {preference ? (
                  <div className="mt-3">
                    <Switch
                      label="Cobrar automáticamente"
                      aria-label={`Cobrar automáticamente a ${method.payerName}`}
                      checked={preference.automatic}
                      disabled={!collection?.available || savingFamily !== null || busy}
                      aria-busy={savingFamily === method.familyId || undefined}
                      onCheckedChange={(checked) => void setAutomatic(method, checked)}
                    />
                    {preference.requiresConfirmation ? (
                      <p className={`${ownerTone.inlineWarning} mt-1`}>
                        Cambió el plan de la academia: vuelve a encenderlo si quieres seguir cobrando automáticamente a esta familia.
                      </p>
                    ) : null}
                  </div>
                ) : null}
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
