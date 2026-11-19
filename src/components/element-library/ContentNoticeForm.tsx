"use client";

import Link from "next/link";
import { useId, useState, type FormEvent } from "react";

import {
  CONTENT_NOTICE_EMAIL_MAX,
  CONTENT_NOTICE_KIND_LABELS,
  CONTENT_NOTICE_KINDS,
  CONTENT_NOTICE_REASON_MAX,
  CONTENT_NOTICE_REASON_MIN,
  CONTENT_NOTICE_SENDER_NAME_MAX,
  CONTENT_NOTICE_SENDER_NAME_MIN,
  CONTENT_NOTICE_URL_MAX,
} from "@/modules/element-library/domain/content-notices";

const ENDPOINT = "/api/public/content-notices";
const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-z-brand-500";
const fieldClassName = `min-h-12 w-full min-w-0 rounded-lg border border-z-line bg-white px-3 text-base text-z-ink sm:text-sm ${FOCUS_RING} disabled:bg-z-canvas`;
const labelClassName = "grid gap-1.5 text-sm font-semibold text-z-ink";
const helpClassName = "text-xs font-normal leading-5 text-z-soft";

type State =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "sent" }
  | { kind: "error"; message: string };

function errorMessage(status: number, detail: unknown): string {
  if (status === 429) return "Has enviado varios avisos seguidos. Espera un rato e inténtalo de nuevo.";
  if (status === 503) {
    return "El formulario no está disponible ahora mismo. Inténtalo más tarde o escríbenos desde la página de contacto.";
  }
  if (status === 413) return "El aviso es demasiado largo. Acorta el motivo e inténtalo de nuevo.";
  if (typeof detail === "string" && detail.trim()) return detail;
  return "No se pudo enviar el aviso. Tus datos siguen aquí; inténtalo de nuevo.";
}

/**
 * Formulario público de avisos sobre contenido (Reglamento de Servicios
 * Digitales, art. 16.2). Enviar un aviso no retira nada: lo revisa una persona.
 */
export function ContentNoticeForm() {
  const idPrefix = useId();
  const [state, setState] = useState<State>({ kind: "idle" });

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind === "submitting") return;
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const payload = {
      contentKind: text("contentKind"),
      contentUrl: text("contentUrl"),
      reason: text("reason"),
      senderName: text("senderName"),
      senderEmail: text("senderEmail"),
      goodFaith: form.get("goodFaith") === "on",
      website: text("website") || null,
    };
    if (!payload.goodFaith) {
      setState({ kind: "error", message: "Marca la declaración de buena fe para enviar el aviso." });
      return;
    }

    setState({ kind: "submitting" });
    try {
      // Reenviar los mismos datos no crea otro aviso: el servidor lo reconoce.
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        setState({ kind: "sent" });
        return;
      }
      const problem = (await response.json().catch(() => null)) as { detail?: unknown } | null;
      setState({ kind: "error", message: errorMessage(response.status, problem?.detail) });
    } catch {
      setState({ kind: "error", message: errorMessage(0, null) });
    }
  }

  if (state.kind === "sent") {
    return (
      <div role="status" className="grid gap-2">
        <h2 className="font-display text-xl font-black uppercase leading-none">Aviso recibido</h2>
        <p className="text-sm leading-6 text-z-soft">
          Lo revisará una persona y te responderemos al correo que has indicado. Enviar un aviso no
          retira el contenido por sí solo.
        </p>
      </div>
    );
  }

  const submitting = state.kind === "submitting";
  return (
    <form onSubmit={onSubmit} className="grid gap-5" aria-describedby={`${idPrefix}-intro`}>
      <p id={`${idPrefix}-intro`} className="text-sm leading-6 text-z-soft">
        Todos los campos son obligatorios.
      </p>

      <label className={labelClassName}>
        Qué contenido señalas
        <select name="contentKind" required defaultValue="" className={fieldClassName} disabled={submitting}>
          <option value="" disabled>
            Elige una opción
          </option>
          {CONTENT_NOTICE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {CONTENT_NOTICE_KIND_LABELS[kind]}
            </option>
          ))}
        </select>
      </label>

      <label className={labelClassName}>
        Dirección exacta del contenido
        <span className={helpClassName}>
          Copia la dirección de la página de Zaltyko donde está (empieza por https://zaltyko.com o por /).
        </span>
        <input
          name="contentUrl"
          required
          maxLength={CONTENT_NOTICE_URL_MAX}
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          className={fieldClassName}
          disabled={submitting}
        />
      </label>

      <label className={labelClassName}>
        Motivo
        <span className={helpClassName}>
          Explica por qué crees que el contenido no debería estar (por ejemplo, de quién son los derechos).
          Entre {CONTENT_NOTICE_REASON_MIN} y {CONTENT_NOTICE_REASON_MAX} caracteres.
        </span>
        <textarea
          name="reason"
          required
          rows={5}
          minLength={CONTENT_NOTICE_REASON_MIN}
          maxLength={CONTENT_NOTICE_REASON_MAX}
          className={`${fieldClassName} py-2`}
          disabled={submitting}
        />
      </label>

      <fieldset className="grid min-w-0 gap-4">
        <legend className="floor-label mb-1 text-z-ink">Quién avisa</legend>
        <label className={labelClassName}>
          Nombre y apellidos
          <input
            name="senderName"
            required
            minLength={CONTENT_NOTICE_SENDER_NAME_MIN}
            maxLength={CONTENT_NOTICE_SENDER_NAME_MAX}
            autoComplete="name"
            className={fieldClassName}
            disabled={submitting}
          />
        </label>
        <label className={labelClassName}>
          Correo electrónico
          <input
            name="senderEmail"
            type="email"
            required
            maxLength={CONTENT_NOTICE_EMAIL_MAX}
            autoComplete="email"
            className={fieldClassName}
            disabled={submitting}
          />
        </label>
      </fieldset>

      {/* Campo trampa: oculto a personas y lectores de pantalla. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label>
          No rellenes este campo
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className="flex items-start gap-3 text-sm leading-6 text-z-ink">
        <input
          name="goodFaith"
          type="checkbox"
          required
          className={`mt-1 h-5 w-5 shrink-0 ${FOCUS_RING}`}
          disabled={submitting}
        />
        <span>
          Declaro de buena fe que la información y lo que afirmo en este aviso son exactos y completos.
        </span>
      </label>

      <p className="text-xs leading-5 text-z-soft">
        Usamos tu nombre y tu correo solo para tramitar este aviso y responderte, y los borramos dos años
        después de cerrarlo. Consulta la{" "}
        <Link href="/politica-privacidad" className="font-semibold text-mat underline underline-offset-2">
          política de privacidad
        </Link>
        .
      </p>

      {state.kind === "error" ? (
        <p role="alert" className="rounded-md border border-signal/30 bg-signal-wash p-3 text-sm font-semibold leading-6 text-signal-ink">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className={`touch-target inline-flex min-h-12 items-center justify-center rounded-lg bg-z-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-z-ink ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {submitting ? "Enviando…" : "Enviar aviso"}
      </button>
    </form>
  );
}
