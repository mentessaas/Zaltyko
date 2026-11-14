"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import { SKIP_REASON_LABELS, type ReminderSkipReason } from "@/modules/payment-reminders/domain/reminder-policy";
import type { PaymentReminderSettings } from "@/modules/payment-reminders/application/settings";
import type { ReminderListItem, ReminderOverview } from "@/modules/payment-reminders/application/service";
import type { DispatchResult, ReminderPreview } from "@/modules/payment-reminders/application/dispatch";

import { formatMoney } from "./manual-payment-form-model";
import { ownerTone, ownerUi } from "./owner-ui";
import { PaymentReminderSettingsForm } from "./PaymentReminderSettingsForm";

type Selection = { kind: "charges"; chargeIds: string[] } | { kind: "overdue" };

interface Problem {
  detail?: string;
  message?: string;
}

const DATE_FORMAT = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" });
const PERIOD_FORMAT = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });

function formatDate(iso: string): string {
  return DATE_FORMAT.format(new Date(iso));
}

function periodLabel(servicePeriodStart: string): string {
  const [year, month] = servicePeriodStart.split("-").map(Number);
  if (!year || !month) return "Cuota";
  return `Cuota de ${PERIOD_FORMAT.format(new Date(Date.UTC(year, month - 1, 1)))}`;
}

function reasonText(item: ReminderListItem): string {
  const reason = item.blockedReason as ReminderSkipReason;
  if (reason === "recently_reminded" && item.nextEligibleAt) {
    return `Ya se recordó hace poco. Podrás volver a recordarla el ${formatDate(item.nextEligibleAt)}.`;
  }
  return SKIP_REASON_LABELS[reason];
}

async function readError(response: Response, fallback: string): Promise<string> {
  const problem = (await response.json().catch(() => null)) as Problem | null;
  return problem?.detail ?? problem?.message ?? fallback;
}

export function PaymentRemindersPanel({
  organizationId,
  locationId,
  overview,
  automaticAvailable,
  suggestedReplyTo,
}: {
  organizationId: string;
  locationId: string | null;
  overview: ReminderOverview;
  /** La bandera global del recordatorio automático está encendida. */
  automaticAvailable: boolean;
  suggestedReplyTo: string | null;
}) {
  const router = useRouter();
  const headingId = useId();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<Selection | null>(null);
  const [preview, setPreview] = useState<ReminderPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DispatchResult | null>(null);
  const [settings, setSettings] = useState<PaymentReminderSettings>(overview.settings);

  const { items } = overview;
  // Las respuestas de las familias deben llegar a la academia: sin su correo no se envía.
  const needsReplyTo = !settings.replyToEmail;
  const remindable = useMemo(() => items.filter((item) => item.canRemind), [items]);
  const selectedRemindable = remindable.filter((item) => selected.has(item.chargeId));

  const baseBody = { organizationId, ...(locationId ? { locationId } : {}) };

  async function openPreview(selection: Selection) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/v1/owner/billing/payment-reminders/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...baseBody, selection }),
      });
      if (!response.ok) {
        setError(await readError(response, "No se ha podido preparar la vista previa."));
        return;
      }
      const body = (await response.json()) as { data: ReminderPreview };
      setPending(selection);
      setPreview(body.data);
    } catch {
      setError("No se ha podido preparar la vista previa. Revisa la conexión e inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmSend() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/owner/billing/payment-reminders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...baseBody, selection: pending }),
      });
      if (!response.ok) {
        setError(await readError(response, "No se han podido enviar los recordatorios."));
        return;
      }
      const body = (await response.json()) as { data: DispatchResult };
      setResult(body.data);
      setPending(null);
      setPreview(null);
      setSelected(new Set());
      router.refresh();
    } catch {
      setError("No sabemos si se enviaron. Actualiza la lista antes de volver a intentarlo: no se repite un aviso reciente.");
    } finally {
      setBusy(false);
    }
  }

  function cancelPreview() {
    setPending(null);
    setPreview(null);
  }

  function toggle(chargeId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(chargeId)) next.delete(chargeId);
      else next.add(chargeId);
      return next;
    });
  }

  return (
    <section aria-labelledby={headingId} className={cn(ownerUi.card, "grid gap-5")}>
      <div className="grid gap-1.5">
        <h2 id={headingId} className={ownerUi.sectionTitle}>
          Recordatorios de cuotas
        </h2>
        <p className={ownerUi.muted}>
          Un aviso amable por correo a la persona que figura como pagadora de cada cuota, nunca al resto de la familia.
          Como máximo uno por cuota cada {settings.minIntervalDays} días. Zaltyko no cobra: el aviso lleva tus datos de pago.
        </p>
      </div>

      {needsReplyTo ? (
        <div role="status" className={ownerUi.noticeWarning}>
          Antes de enviar, indica el correo de la academia en «Plantilla, datos de pago y límites». Las familias responderán
          a ese correo.
        </div>
      ) : null}

      {error ? (
        <div role="alert" className={ownerUi.noticeError}>
          {error}
        </div>
      ) : null}

      {result ? (
        <div role="status" className={ownerUi.noticeInfo}>
          <p className="font-semibold">
            {result.sent === 0
              ? "No se ha enviado ningún recordatorio."
              : `Recordatorios enviados: ${result.sent} ${result.sent === 1 ? "cuota" : "cuotas"} en ${result.emails} ${result.emails === 1 ? "correo" : "correos"}.`}
          </p>
          {result.failed > 0 ? (
            <p>
              {result.failed} no se {result.failed === 1 ? "pudo" : "pudieron"} enviar. No cuentan para el límite: puedes
              volver a intentarlo.
            </p>
          ) : null}
          {result.skipped > 0 ? <p>{result.skipped} se omitieron porque no cumplían las condiciones.</p> : null}
          {result.remaining > 0 ? (
            <p>
              Quedan {result.remaining} cuotas por recordar: el envío admite hasta {overview.maxChargesPerBatch} cuotas cada vez.
            </p>
          ) : null}
        </div>
      ) : null}

      {preview && pending ? (
        <div role="region" aria-label="Vista previa del envío" className={cn(ownerTone.innerPanel, "grid gap-4")}>
          <p className="font-semibold text-z-ink">
            {preview.totalEmails === 0
              ? "No hay ninguna cuota a la que se pueda recordar ahora mismo."
              : `Se enviarán ${preview.totalEmails} ${preview.totalEmails === 1 ? "correo" : "correos"} (${preview.totalCharges} ${preview.totalCharges === 1 ? "cuota" : "cuotas"}). Revisa el mensaje antes de enviar.`}
          </p>
          {preview.samples.map((sample, index) => (
            <article key={index} className="grid gap-2 rounded-md bg-z-canvas p-3.5">
              <p className={ownerUi.smallLabel}>
                Para {sample.recipient} · {sample.chargeCount} {sample.chargeCount === 1 ? "cuota" : "cuotas"}
              </p>
              <p className="text-sm font-semibold text-z-ink">Asunto: {sample.subject}</p>
              <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-z-ink">{sample.text}</pre>
            </article>
          ))}
          {preview.totalEmails > preview.samples.length ? (
            <p className={ownerUi.help}>
              Se muestran {preview.samples.length} ejemplos; el resto lleva el mismo texto con sus propios datos.
            </p>
          ) : null}
          {preview.remaining > 0 ? (
            <p className={ownerTone.inlineWarning}>
              Hay {preview.remaining} cuotas más. Este envío admite hasta {overview.maxChargesPerBatch} cuotas; repite después.
            </p>
          ) : null}
          {preview.skipped.length > 0 ? (
            <p className={ownerUi.help}>
              {preview.skipped.length} {preview.skipped.length === 1 ? "cuota se omite" : "cuotas se omiten"} (falta la
              persona pagadora o su correo, ya se recordaron hace poco o ya están saldadas).
            </p>
          ) : null}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className={ownerUi.primaryButton}
              disabled={busy || preview.totalEmails === 0}
              onClick={confirmSend}
            >
              {busy ? "Enviando…" : "Enviar recordatorios"}
            </button>
            <button type="button" className={ownerUi.secondaryButton} disabled={busy} onClick={cancelPreview}>
              Cancelar
            </button>
          </div>
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className={ownerUi.muted}>No hay cuotas pendientes ni vencidas.</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={ownerUi.primaryButton}
              disabled={busy || needsReplyTo || overview.remindableOverdueCount === 0}
              onClick={() => openPreview({ kind: "overdue" })}
            >
              Recordar a todas las vencidas ({overview.remindableOverdueCount})
            </button>
            <button
              type="button"
              className={ownerUi.secondaryButton}
              disabled={busy || needsReplyTo || selectedRemindable.length === 0}
              onClick={() =>
                openPreview({ kind: "charges", chargeIds: selectedRemindable.map((item) => item.chargeId) })
              }
            >
              Recordar a las seleccionadas ({selectedRemindable.length})
            </button>
            <span className={ownerUi.help}>
              {overview.overdueCount} vencidas de {items.length} abiertas
            </span>
          </div>

          <ul className="grid gap-3" aria-label="Cuotas abiertas">
            {items.map((item) => (
              <li key={item.chargeId} className={cn(ownerUi.listItem, "grid gap-2 sm:grid-cols-[auto_1fr_auto] sm:items-start")}>
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5"
                  aria-label={`Seleccionar ${periodLabel(item.servicePeriodStart)} de ${item.payerFirstName ?? "la familia"}`}
                  checked={selected.has(item.chargeId)}
                  disabled={!item.canRemind || busy}
                  onChange={() => toggle(item.chargeId)}
                />
                <div className="grid min-w-0 gap-1">
                  <p className="font-semibold text-z-ink">
                    {periodLabel(item.servicePeriodStart)} · {formatMoney(item.outstandingCents, item.currency)}
                  </p>
                  <p className={ownerUi.muted}>
                    {item.payerFirstName ?? "Falta la persona pagadora"}
                    {item.payerEmailMasked ? ` · ${item.payerEmailMasked}` : ""} · {item.locationName} · {item.invoiceReference}
                  </p>
                  <p className="flex flex-wrap items-center gap-2 text-sm text-z-ink">
                    <span className={item.overdue ? ownerTone.chipWarning : ownerTone.chipOutline}>
                      {item.overdue
                        ? `Vencida hace ${item.daysOverdue} ${item.daysOverdue === 1 ? "día" : "días"}`
                        : `Vence el ${formatDate(item.dueAt)}`}
                    </span>
                    <span className={ownerUi.help}>
                      {item.lastRemindedAt
                        ? `Recordada el ${formatDate(item.lastRemindedAt)} (${item.reminderCount} ${item.reminderCount === 1 ? "vez" : "veces"})`
                        : "Aún no recordada"}
                    </span>
                  </p>
                  {!item.canRemind ? <p className={ownerTone.inlineWarning}>{reasonText(item)}</p> : null}
                </div>
                <button
                  type="button"
                  className={ownerUi.secondaryButton}
                  disabled={!item.canRemind || busy || needsReplyTo}
                  onClick={() => openPreview({ kind: "charges", chargeIds: [item.chargeId] })}
                >
                  Recordar
                </button>
              </li>
            ))}
          </ul>
          {overview.truncated ? (
            <p className={ownerUi.help}>
              Se muestran las {items.length} cuotas más antiguas. Al saldar o recordar estas, aparecerán las siguientes.
            </p>
          ) : null}
        </>
      )}

      <PaymentReminderSettingsForm
        organizationId={organizationId}
        settings={settings}
        automaticAvailable={automaticAvailable}
        suggestedReplyTo={suggestedReplyTo}
        previewSelection={
          selectedRemindable.length > 0
            ? { kind: "charges", chargeIds: selectedRemindable.map((item) => item.chargeId) }
            : { kind: "overdue" }
        }
        locationId={locationId}
        onSaved={(next) => {
          setSettings(next);
          router.refresh();
        }}
      />
    </section>
  );
}
