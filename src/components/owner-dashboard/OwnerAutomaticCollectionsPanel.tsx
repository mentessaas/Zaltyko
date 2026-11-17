"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ownerTone, ownerUi } from "./owner-ui";
import type {
  OwnerAutomaticCollectionItem,
  OwnerAutomaticCollectionState,
  OwnerAutomaticCollectionsView,
} from "@/modules/family-collection/application/family-collection-reads";
import { formatCalendarDate, formatMoney } from "@/modules/family-portal/domain/family-portal-presentation";

// Cobro automático de cuotas (Fase 3): los cobros automáticos del mes en
// /owner/payments, con su estado, el motivo en palabras sencillas, los que
// necesitan revisión y las acciones de la academia. El servidor vuelve a
// comprobar cada acción: aquí solo se ofrecen las que la lectura permite.

// Ruta relativa: el fetch es del mismo origen y el navegador añade la cabecera
// Origin que la API exige en el POST (protección contra CSRF).
const ACTION_ENDPOINT = "/api/v1/owner/payments/automatic-collection";
const ACTION_ERROR = "No hemos podido completar la acción. Inténtalo de nuevo.";
const CANCELED_BY_ACADEMY = "Lo canceló la academia.";
const REVIEWED_BY_ACADEMY = "La academia lo revisó y lo cerró.";
// Cerrado sin poder saber si se cobró: Stripe no deja leer el cobro (p. ej. la
// cuenta se desconectó) o cobró otro importe, que no se registra.
const REVIEWED_UNVERIFIABLE =
  "Comprueba en tu panel de Stripe si se cobró; si se cobró, regístralo como pago manual.";

// Rechazos (409) que piden algo concreto a la academia. «Necesita soporte»
// lleva el texto de la acción que se intentó: tras él no se ofrece ninguna.
const NEEDS_SUPPORT_TEXT: Record<"cancel" | "mark_reviewed", string> = {
  cancel:
    "No se puede cancelar desde aquí: en Stripe hay dinero que se ha movido o no se puede leer el cobro de esta cuota. Resuélvelo en tu panel de Stripe con su soporte.",
  mark_reviewed:
    "No se puede marcar como revisado: en Stripe hay dinero que se ha movido o no tenemos los datos para comprobar el cobro de esta cuota. Escríbenos a soporte.",
};
// Cancelar no sirve porque el cobro ya se hizo en Stripe: ya figura registrado
// en otro cobro automático o Stripe cobró otro importe.
const REVIEW_REQUIRED_TEXT =
  "No se puede cancelar: este cobro ya se hizo en Stripe (está registrado en otro cobro automático o por otro importe). Compruébalo en Stripe y usa «Marcar como revisado».";
const CHANGED_TEXT =
  "El cobro automático de esta cuota cambió o acaba de empezar. Recarga la página y vuelve a intentarlo.";

// Aviso del primer cobro fallido a la familia (D3).
const FAMILY_NOTICE_TEXT: Record<"sent" | "not_sent", string> = {
  sent: "Hemos avisado a la familia por correo de que no se pudo cobrar.",
  not_sent: "No hemos podido avisar a la familia por correo. Avísala tú.",
};

type Outcome = "canceled" | "reviewed" | "collected" | "unverifiable";

function isOutcome(value: unknown): value is Outcome {
  return value === "canceled" || value === "reviewed" || value === "collected" || value === "unverifiable";
}
type ActionBody = { outcome?: unknown; detail?: unknown; type?: unknown } | null;

/** Último tramo del `type` de un problema (`…/problems/<tipo>`). */
function problemType(body: ActionBody): string | null {
  return typeof body?.type === "string" ? (body.type.split("/").pop() ?? null) : null;
}

function monthLabel(month: string): string {
  const date = new Date(`${month}-15T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return month;
  return new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

function stateText(state: OwnerAutomaticCollectionState, date: string | null): string {
  const day = date ? formatCalendarDate(date) : null;
  switch (state) {
    case "scheduled":
      return day ? `Se cobrará el ${day}` : "Se cobrará automáticamente";
    case "in_progress":
    case "processing":
      return "Cobro en curso";
    case "collected":
      return day ? `Cobrada el ${day}` : "Cobrada automáticamente";
    case "retry_scheduled":
      return day ? `No se pudo cobrar; se volverá a intentar el ${day}` : "No se pudo cobrar; se volverá a intentar";
    case "manual":
      return "Se cobrará a mano";
    case "failed":
      return "No se pudo cobrar";
    case "canceled":
      return "Cobro automático cancelado";
    case "not_attempted":
      return "No se cobró automáticamente";
  }
}

function stateChip(state: OwnerAutomaticCollectionState): string {
  switch (state) {
    case "collected":
      return ownerTone.chipSuccess;
    case "in_progress":
    case "processing":
      return ownerTone.chipActive;
    case "retry_scheduled":
    case "not_attempted":
    case "manual":
      return ownerTone.chipWarning;
    case "failed":
      return ownerTone.chipError;
    default:
      return ownerTone.chipRest;
  }
}

/** Las cuotas que ya no se cobran solas se cobran a mano (con recordatorios). */
function chargedByHand(state: OwnerAutomaticCollectionState): boolean {
  return state === "failed" || state === "canceled" || state === "not_attempted" || state === "manual";
}

export function OwnerAutomaticCollectionsPanel({
  organizationId,
  view,
}: {
  organizationId: string;
  view: OwnerAutomaticCollectionsView;
}) {
  const router = useRouter();
  const [items, setItems] = useState(view.items);
  const [confirmingCancel, setConfirmingCancel] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [checkedInStripe, setCheckedInStripe] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  // Tras router.refresh() llega una lectura nueva del servidor: manda sobre
  // los cambios locales de esta pantalla.
  useEffect(() => {
    setItems(view.items);
  }, [view]);

  async function act(item: OwnerAutomaticCollectionItem, action: "cancel" | "mark_reviewed") {
    if (busyRef.current) return;
    if (action === "mark_reviewed" && !checkedInStripe) return;
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    let outcome: Outcome | null = null;
    let failure = ACTION_ERROR;
    let rejection: string | null = null;
    try {
      const response = await fetch(ACTION_ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          action === "cancel"
            ? { action, organizationId, invoiceId: item.invoiceId }
            : { action, organizationId, invoiceId: item.invoiceId, checkedInStripe: true }
        ),
      });
      const body = (await response.json().catch(() => null)) as ActionBody;
      const answered = body?.outcome;
      if (response.ok && isOutcome(answered)) {
        outcome = answered;
      } else if (!response.ok) {
        rejection = problemType(body);
        if (rejection === "automatic-collection-needs-support") failure = NEEDS_SUPPORT_TEXT[action];
        else if (rejection === "automatic-collection-review-required") failure = REVIEW_REQUIRED_TEXT;
        else if (rejection === "concurrency-retry") failure = CHANGED_TEXT;
        else if (typeof body?.detail === "string" && body.detail.trim()) failure = body.detail;
      }
    } catch {
      outcome = null;
    }
    busyRef.current = false;
    setBusy(false);
    if (!outcome) {
      if (rejection === "automatic-collection-review-required") {
        // Cancelar no sirve: el cobro ya se hizo en Stripe (registrado en otro
        // intento o por otro importe). Se ofrece «Marcar como revisado» (el
        // servidor lo vuelve a comprobar).
        setConfirmingCancel(null);
        setItems((current) =>
          current.map(
            (entry): OwnerAutomaticCollectionItem =>
              entry.invoiceId === item.invoiceId
                ? { ...entry, canCancel: false, canMarkReviewed: true, needsReview: true }
                : entry
          )
        );
      } else if (rejection === "automatic-collection-needs-support") {
        // No se puede cerrar desde aquí, ni cancelándolo ni marcándolo como
        // revisado: se resuelve en Stripe con su soporte. Se retiran las dos.
        setConfirmingCancel(null);
        setReviewing(null);
        setCheckedInStripe(false);
        setItems((current) =>
          current.map(
            (entry): OwnerAutomaticCollectionItem =>
              entry.invoiceId === item.invoiceId
                ? { ...entry, canCancel: false, canMarkReviewed: false, needsReview: true }
                : entry
          )
        );
      }
      setMessage({ tone: "error", text: failure });
      return;
    }
    const done: Outcome = outcome;

    setConfirmingCancel(null);
    setReviewing(null);
    setCheckedInStripe(false);
    setItems((current) =>
      current.map((entry): OwnerAutomaticCollectionItem =>
        entry.invoiceId !== item.invoiceId
          ? entry
          : {
              ...entry,
              state: done === "collected" ? "collected" : "canceled",
              date: null,
              reason:
                done === "collected"
                  ? null
                  : done === "canceled"
                    ? CANCELED_BY_ACADEMY
                    : done === "unverifiable"
                      ? REVIEWED_UNVERIFIABLE
                      : REVIEWED_BY_ACADEMY,
              needsReview: false,
              canCancel: false,
              canMarkReviewed: false,
              manualPaymentBlocked: false,
            }
      )
    );
    setMessage({
      tone: "info",
      text:
        done === "collected"
          ? `El cobro de la cuota ${item.invoiceReference} ya se había hecho y ha quedado registrado.`
          : done === "canceled"
            ? `Cobro automático cancelado. La cuota ${item.invoiceReference} se cobra a mano.`
            : done === "unverifiable"
              ? `Cobro marcado como revisado. La cuota ${item.invoiceReference} se cobra a mano. ${REVIEWED_UNVERIFIABLE}`
              : `Cobro marcado como revisado. La cuota ${item.invoiceReference} se cobra a mano.`,
    });
    router.refresh();
  }

  return (
    <section id="cobros-automaticos" className={ownerUi.card} aria-labelledby="cobros-automaticos-title">
      <h2 id="cobros-automaticos-title" className={ownerUi.sectionTitle}>
        {view.inProgressOnly ? "Cobros automáticos en curso" : "Cobros automáticos de este mes"}
      </h2>
      {view.inProgressOnly ? (
        // Bandera general apagada: no se cobra nada nuevo; solo salen los cobros
        // que ya estaban en marcha (bloquean el pago a mano hasta que terminen).
        <p className={`${ownerUi.help} mt-2`}>
          El cobro automático está parado: ya no se cobra ninguna cuota nueva. Estos cobros ya estaban en marcha y siguen su curso.
        </p>
      ) : (
        <p className={`${ownerUi.help} mt-2`}>
          Cuotas de {monthLabel(view.month)} que se cobran solas. Las que no se pueden cobrar pasan a cobrarse a mano.
        </p>
      )}

      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={`${message.tone === "error" ? ownerUi.noticeError : ownerUi.noticeInfo} mt-4`}
        >
          {message.text}
        </p>
      ) : null}

      {items.length === 0 ? (
        <p className={`${ownerUi.muted} mt-5`}>
          {view.inProgressOnly
            ? "Ya no queda ningún cobro automático en curso."
            : "Este mes todavía no hay cuotas que se cobren automáticamente."}
        </p>
      ) : (
        <ul className="mt-5 space-y-3">
          {items.map((item) => (
            <li key={item.invoiceId} className={ownerUi.listItem}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-z-ink">Cuota {item.invoiceReference}</p>
                  <p className={ownerUi.help}>
                    {item.payerName ? `${item.payerName} · ` : ""}
                    <span className="tabular-nums">{formatMoney(item.amountCents, item.currency)}</span>
                  </p>
                </div>
                <p className="flex flex-wrap items-center gap-2">
                  <span className={stateChip(item.state)}>{stateText(item.state, item.date)}</span>
                  {item.needsReview ? <span className={ownerUi.chipAttention}>Necesita revisión</span> : null}
                </p>
              </div>
              {item.reason ? <p className={`${ownerUi.muted} mt-2`}>{item.reason}</p> : null}
              {item.familyNotice ? (
                <p className={`${ownerUi.help} mt-1`}>{FAMILY_NOTICE_TEXT[item.familyNotice]}</p>
              ) : null}
              {chargedByHand(item.state) ? (
                <p className={`${ownerUi.help} mt-1`}>Esta cuota se cobra a mano: registra el pago cuando lo recibas.</p>
              ) : null}

              {item.canCancel || item.canMarkReviewed ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {item.canCancel && confirmingCancel !== item.invoiceId ? (
                    <button
                      type="button"
                      className={ownerTone.dangerOutlineButton}
                      disabled={busy}
                      aria-label={`Cancelar el cobro automático de la cuota ${item.invoiceReference}`}
                      onClick={() => {
                        setMessage(null);
                        setReviewing(null);
                        setConfirmingCancel(item.invoiceId);
                      }}
                    >
                      Cancelar el cobro automático
                    </button>
                  ) : null}
                  {item.canMarkReviewed && reviewing !== item.invoiceId ? (
                    <button
                      type="button"
                      className={ownerUi.secondaryButton}
                      disabled={busy}
                      aria-label={`Marcar como revisado el cobro de la cuota ${item.invoiceReference}`}
                      onClick={() => {
                        setMessage(null);
                        setConfirmingCancel(null);
                        setCheckedInStripe(false);
                        setReviewing(item.invoiceId);
                      }}
                    >
                      Marcar como revisado
                    </button>
                  ) : null}
                </div>
              ) : null}

              {confirmingCancel === item.invoiceId ? (
                <div
                  className={`${ownerUi.subtlePanel} mt-3`}
                  role="group"
                  aria-label={`Confirmar la cancelación del cobro automático de la cuota ${item.invoiceReference}`}
                >
                  <p className="text-sm text-z-ink">
                    ¿Cancelar el cobro automático de la cuota {item.invoiceReference}? No se cobrará sola: tendrás que cobrarla a mano.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={ownerTone.dangerButton}
                      disabled={busy}
                      aria-busy={busy || undefined}
                      onClick={() => void act(item, "cancel")}
                    >
                      {busy ? "Cancelando…" : "Sí, cancelar el cobro"}
                    </button>
                    <button type="button" className={ownerUi.secondaryButton} disabled={busy} onClick={() => setConfirmingCancel(null)}>
                      No
                    </button>
                  </div>
                </div>
              ) : null}

              {reviewing === item.invoiceId ? (
                <div
                  className={`${ownerUi.subtlePanel} mt-3`}
                  role="group"
                  aria-label={`Marcar como revisado el cobro de la cuota ${item.invoiceReference}`}
                >
                  <p className="text-sm text-z-ink">
                    Antes de marcarlo, abre tu panel de Stripe y comprueba si este cobro se hizo. Si se hizo, lo registraremos; si no, la cuota pasará a cobrarse a mano.
                  </p>
                  <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold text-z-ink">
                    <input
                      type="checkbox"
                      className="size-4 accent-z-brand-500"
                      checked={checkedInStripe}
                      disabled={busy}
                      onChange={(event) => setCheckedInStripe(event.target.checked)}
                    />
                    He comprobado el cobro en Stripe
                  </label>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={ownerUi.primaryButton}
                      disabled={busy || !checkedInStripe}
                      aria-busy={busy || undefined}
                      onClick={() => void act(item, "mark_reviewed")}
                    >
                      {busy ? "Guardando…" : "Confirmar revisión"}
                    </button>
                    <button type="button" className={ownerUi.secondaryButton} disabled={busy} onClick={() => setReviewing(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {view.truncated ? (
        <p className={`${ownerUi.help} mt-4`}>Se muestran los 100 más recientes.</p>
      ) : null}
    </section>
  );
}
