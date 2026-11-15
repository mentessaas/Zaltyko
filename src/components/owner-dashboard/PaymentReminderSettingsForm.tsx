"use client";

import { useId, useRef, useState, type FormEvent } from "react";

import type { PaymentReminderSettings } from "@/modules/payment-reminders/application/settings";
import type { ReminderPreview } from "@/modules/payment-reminders/application/dispatch";
import {
  AUTO_AFTER_DAYS_RANGE,
  MIN_INTERVAL_DAYS_RANGE,
} from "@/modules/payment-reminders/domain/reminder-policy";
import {
  BODY_MAX_LENGTH,
  DEFAULT_BODY,
  DEFAULT_SUBJECT,
  PAYMENT_INSTRUCTIONS_MAX_LENGTH,
  SUBJECT_MAX_LENGTH,
  type TemplateVariable,
} from "@/modules/payment-reminders/domain/reminder-template";

import { ownerField, ownerTone, ownerUi } from "./owner-ui";

/** Datos que el mensaje rellena solo, con el nombre que ve la academia. */
const AUTOFILL_FIELDS: ReadonlyArray<{ variable: TemplateVariable; label: string }> = [
  { variable: "nombre", label: "Nombre de la persona pagadora" },
  { variable: "importe", label: "Importe pendiente" },
  { variable: "concepto", label: "Mes de la cuota" },
  { variable: "vencimiento", label: "Fecha de vencimiento" },
  { variable: "academia", label: "Nombre de la academia" },
  { variable: "datos_de_pago", label: "Datos de pago" },
];

type Selection = { kind: "charges"; chargeIds: string[] } | { kind: "overdue" };

interface Problem {
  detail?: string;
  message?: string;
}

async function readError(response: Response, fallback: string): Promise<string> {
  const problem = (await response.json().catch(() => null)) as Problem | null;
  return problem?.detail ?? problem?.message ?? fallback;
}

export function PaymentReminderSettingsForm({
  organizationId,
  locationId,
  settings,
  automaticAvailable,
  suggestedReplyTo,
  previewSelection,
  onSaved,
}: {
  organizationId: string;
  locationId: string | null;
  settings: PaymentReminderSettings;
  automaticAvailable: boolean;
  /** Correo de la cuenta de quien administra, para proponerlo la primera vez. */
  suggestedReplyTo: string | null;
  previewSelection: Selection;
  onSaved: (settings: PaymentReminderSettings) => void;
}) {
  const ids = useId();
  const [subject, setSubject] = useState(settings.subjectTemplate ?? "");
  const [body, setBody] = useState(settings.bodyTemplate ?? "");
  const [instructions, setInstructions] = useState(settings.paymentInstructions ?? "");
  const [replyTo, setReplyTo] = useState(settings.replyToEmail ?? suggestedReplyTo ?? "");
  const [interval, setInterval] = useState(String(settings.minIntervalDays));
  const [auto, setAuto] = useState(settings.autoEnabled);
  const [autoAfter, setAutoAfter] = useState(String(settings.autoAfterDays));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [sample, setSample] = useState<ReminderPreview["samples"][number] | null | "none">(null);

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [target, setTarget] = useState<"subject" | "body">("body");

  /** Inserta un dato que se rellena solo donde está el cursor del asunto o del mensaje. */
  function insertField(variable: TemplateVariable) {
    const token = `{{${variable}}}`;
    const element = target === "subject" ? subjectRef.current : bodyRef.current;
    const current = target === "subject" ? subject : body;
    const start = element?.selectionStart ?? current.length;
    const end = element?.selectionEnd ?? current.length;
    const next = `${current.slice(0, start)}${token}${current.slice(end)}`;
    if (target === "subject") setSubject(next);
    else setBody(next);
    requestAnimationFrame(() => {
      element?.focus();
      element?.setSelectionRange(start + token.length, start + token.length);
    });
  }

  const draft = { subject: subject || null, body: body || null, paymentInstructions: instructions || null };

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/v1/owner/billing/payment-reminders/settings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId,
          settings: {
            subjectTemplate: draft.subject,
            bodyTemplate: draft.body,
            paymentInstructions: draft.paymentInstructions,
            replyToEmail: replyTo.trim() || null,
            minIntervalDays: Number(interval),
            autoEnabled: auto,
            autoAfterDays: Number(autoAfter),
          },
        }),
      });
      if (!response.ok) {
        setMessage({ tone: "error", text: await readError(response, "No se ha podido guardar la plantilla.") });
        return;
      }
      const result = (await response.json()) as { data: PaymentReminderSettings };
      onSaved(result.data);
      setMessage({ tone: "ok", text: "Plantilla y límites guardados." });
    } catch {
      setMessage({ tone: "error", text: "No se ha podido guardar. Revisa la conexión e inténtalo de nuevo." });
    } finally {
      setBusy(false);
    }
  }

  async function previewDraft() {
    setBusy(true);
    setMessage(null);
    setSample(null);
    try {
      const response = await fetch("/api/v1/owner/billing/payment-reminders/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId,
          ...(locationId ? { locationId } : {}),
          selection: previewSelection,
          draft,
        }),
      });
      if (!response.ok) {
        setMessage({ tone: "error", text: await readError(response, "No se ha podido generar el ejemplo.") });
        return;
      }
      const result = (await response.json()) as { data: ReminderPreview };
      setSample(result.data.samples[0] ?? "none");
    } catch {
      setMessage({ tone: "error", text: "No se ha podido generar el ejemplo." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className={ownerTone.innerPanel}>
      <summary className="cursor-pointer text-sm font-semibold text-z-ink">Plantilla, datos de pago y límites</summary>
      <form onSubmit={save} className="mt-4 grid gap-4">
        <div className="grid gap-1.5">
          <label htmlFor={`${ids}-subject`} className={ownerUi.label}>
            Asunto
          </label>
          <input
            id={`${ids}-subject`}
            className={ownerField}
            ref={subjectRef}
            value={subject}
            maxLength={SUBJECT_MAX_LENGTH}
            onFocus={() => setTarget("subject")}
            placeholder={DEFAULT_SUBJECT}
            onChange={(event) => setSubject(event.target.value)}
          />
        </div>

        <div className="grid gap-1.5">
          <label htmlFor={`${ids}-body`} className={ownerUi.label}>
            Mensaje
          </label>
          <textarea
            id={`${ids}-body`}
            className={`${ownerField} min-h-48 py-2 leading-6`}
            ref={bodyRef}
            value={body}
            maxLength={BODY_MAX_LENGTH}
            onFocus={() => setTarget("body")}
            placeholder={DEFAULT_BODY}
            onChange={(event) => setBody(event.target.value)}
          />
          <p className={ownerUi.help}>
            Déjalo vacío para usar el texto por defecto. Escribe con cercanía: no se admiten expresiones de reclamación
            amenazante, como «moroso» o «acciones legales».
          </p>
        </div>

        <fieldset className="grid gap-2">
          <legend className={ownerUi.label}>Datos que se rellenan solos</legend>
          <p className={ownerUi.help}>
            Pulsa uno para ponerlo donde está el cursor, en el asunto o en el mensaje. En cada correo se sustituye por el dato
            real de esa familia.
          </p>
          <div className="flex flex-wrap gap-2">
            {AUTOFILL_FIELDS.map((field) => (
              <button
                key={field.variable}
                type="button"
                className={ownerUi.secondaryButton}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertField(field.variable)}
              >
                {field.label}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid gap-1.5">
          <label htmlFor={`${ids}-instructions`} className={ownerUi.label}>
            Datos de pago (texto libre)
          </label>
          <textarea
            id={`${ids}-instructions`}
            className={`${ownerField} min-h-24 py-2 leading-6`}
            value={instructions}
            maxLength={PAYMENT_INSTRUCTIONS_MAX_LENGTH}
            placeholder={"Transferencia a ES00 0000 0000 0000 0000 0000, concepto: nombre de la gimnasta.\nBizum al 600 000 000 o efectivo en recepción."}
            onChange={(event) => setInstructions(event.target.value)}
          />
          <p className={ownerUi.help}>
            Aparecen en el mensaje donde insertes «Datos de pago». Escribe aquí solo los datos de tu academia (IBAN, Bizum,
            horario de caja); nunca datos de otras personas.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <label htmlFor={`${ids}-replyto`} className={ownerUi.label}>
              Correo de la academia para las respuestas
            </label>
            <input
              id={`${ids}-replyto`}
              type="email"
              required
              className={ownerField}
              value={replyTo}
              maxLength={254}
              onChange={(event) => setReplyTo(event.target.value)}
            />
            <p className={ownerUi.help}>Las familias responderán a este correo. Sin él no se puede enviar ningún recordatorio.</p>
          </div>
          <div className="grid gap-1.5">
            <label htmlFor={`${ids}-interval`} className={ownerUi.label}>
              Días mínimos entre recordatorios de una cuota
            </label>
            <input
              id={`${ids}-interval`}
              type="number"
              inputMode="numeric"
              className={ownerField}
              min={MIN_INTERVAL_DAYS_RANGE.min}
              max={MIN_INTERVAL_DAYS_RANGE.max}
              value={interval}
              onChange={(event) => setInterval(event.target.value)}
            />
          </div>
        </div>

        <fieldset className="grid gap-2">
          <legend className={ownerUi.label}>Recordatorio automático</legend>
          <label className="flex items-start gap-2 text-sm text-z-ink">
            <input
              type="checkbox"
              className="mt-1 h-5 w-5"
              checked={auto}
              disabled={!automaticAvailable}
              onChange={(event) => setAuto(event.target.checked)}
            />
            <span>
              Enviar un único recordatorio automático cuando una cuota lleve{" "}
              <input
                aria-label="Días tras el vencimiento"
                type="number"
                inputMode="numeric"
                className={`${ownerField} inline-block w-20`}
                min={AUTO_AFTER_DAYS_RANGE.min}
                max={AUTO_AFTER_DAYS_RANGE.max}
                value={autoAfter}
                disabled={!automaticAvailable}
                onChange={(event) => setAutoAfter(event.target.value)}
              />{" "}
              días vencida y no haya recibido ningún aviso.
            </span>
          </label>
          <p className={ownerUi.help}>
            Apagado por defecto. {automaticAvailable ? "" : "Todavía no está disponible en tu cuenta. "}Los avisos manuales
            siguen funcionando igual.
          </p>
        </fieldset>

        {message ? (
          <div role={message.tone === "error" ? "alert" : "status"} className={message.tone === "error" ? ownerUi.noticeError : ownerUi.noticeInfo}>
            {message.text}
          </div>
        ) : null}

        {sample ? (
          <div role="region" aria-label="Ejemplo con estos cambios" className="grid gap-2 rounded-md bg-z-canvas p-3.5">
            {sample === "none" ? (
              <p className={ownerUi.muted}>No hay ninguna cuota apta para recordar ahora, así que no hay ejemplo.</p>
            ) : (
              <>
                <p className={ownerUi.smallLabel}>Ejemplo para {sample.recipient}</p>
                <p className="text-sm font-semibold text-z-ink">Asunto: {sample.subject}</p>
                <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-z-ink">{sample.text}</pre>
              </>
            )}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button type="submit" className={ownerUi.primaryButton} disabled={busy}>
            Guardar
          </button>
          <button type="button" className={ownerUi.secondaryButton} disabled={busy} onClick={previewDraft}>
            Ver ejemplo con estos cambios
          </button>
        </div>
      </form>
    </details>
  );
}
