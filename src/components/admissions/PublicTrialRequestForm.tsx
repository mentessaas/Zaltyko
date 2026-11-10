"use client";

import Link from "next/link";
import { useId, useMemo, useRef, useState, type FormEvent } from "react";

const ENDPOINT = "/api/public/trial-requests";
const FOCUS_RING =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-z-brand-500";
const fieldClassName = `min-h-12 w-full min-w-0 rounded-lg border border-z-line bg-white px-3 text-base text-z-ink sm:text-sm ${FOCUS_RING} disabled:bg-z-canvas`;
const labelClassName = "grid gap-1.5 text-sm font-semibold text-z-ink";
const helpClassName = "text-xs font-normal leading-5 text-z-soft";

type Location = { id: string; name: string };
type State =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "sent" }
  | { kind: "error"; message: string };

function newSubmissionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Navegadores antiguos: UUID v4 con getRandomValues.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function errorMessage(status: number, detail: unknown): string {
  if (status === 429) return "Has enviado varias solicitudes seguidas. Espera un rato e inténtalo de nuevo.";
  if (status === 503) return "La academia todavía no recibe solicitudes en línea.";
  if (status === 409) return "Esta solicitud ya se envió con otros datos. Recarga la página para enviar una nueva.";
  if (typeof detail === "string" && detail.trim()) return detail;
  return "No se pudo enviar la solicitud. Tus datos siguen aquí; inténtalo de nuevo.";
}

export function PublicTrialRequestForm({
  organizationId,
  organizationName,
  locations,
  initialLocationId,
}: {
  organizationId: string;
  organizationName: string;
  locations: Location[];
  initialLocationId: string | null;
}) {
  const idPrefix = useId();
  const submissionId = useRef<string | null>(null);
  const lastPayload = useRef<string | null>(null);
  const [state, setState] = useState<State>({ kind: "idle" });
  const currentYear = useMemo(() => new Date().getFullYear(), []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state.kind === "submitting") return;
    const form = new FormData(event.currentTarget);
    const text = (name: string) => String(form.get(name) ?? "").trim();
    const birthYear = text("athleteBirthYear");
    const payload = {
      organizationId,
      locationId: locations.length === 1 ? locations[0]!.id : text("locationId") || null,
      contactName: text("contactName"),
      contactEmail: text("contactEmail"),
      contactPhone: text("contactPhone") || null,
      athleteGivenName: text("athleteGivenName"),
      athleteBirthYear: birthYear ? Number(birthYear) : null,
      message: text("message") || null,
      privacyConsent: form.get("privacyConsent") === "on",
      website: text("website") || null,
    };
    if (!payload.privacyConsent) {
      setState({ kind: "error", message: "Marca la casilla de privacidad para enviar la solicitud." });
      return;
    }
    // Un reenvío de los mismos datos reutiliza la clave: la academia no recibe duplicados.
    const serialized = JSON.stringify(payload);
    if (!submissionId.current || lastPayload.current !== serialized) {
      submissionId.current = newSubmissionId();
      lastPayload.current = serialized;
    }

    setState({ kind: "submitting" });
    try {
      const response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ ...payload, submissionId: submissionId.current }),
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
        <h2 className="font-display text-xl font-black uppercase leading-none">Solicitud enviada</h2>
        <p className="text-sm leading-6 text-z-soft">
          {organizationName} ha recibido tu solicitud y se pondrá en contacto contigo.
          No te hemos apuntado a ninguna lista de correo.
        </p>
      </div>
    );
  }

  const submitting = state.kind === "submitting";
  return (
    <form onSubmit={onSubmit} className="grid gap-5" aria-describedby={`${idPrefix}-intro`}>
      <p id={`${idPrefix}-intro`} className="text-sm leading-6 text-z-soft">
        Los campos sin «opcional» son obligatorios.
      </p>

      {locations.length > 1 ? (
        <label className={labelClassName}>
          Sede
          <select
            name="locationId"
            required
            defaultValue={initialLocationId ?? ""}
            className={fieldClassName}
            disabled={submitting}
          >
            <option value="" disabled>
              Elige una sede
            </option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
      ) : locations[0] ? (
        <p className="text-sm text-z-ink">
          <span className="font-semibold">Sede:</span> {locations[0].name}
        </p>
      ) : null}

      <fieldset className="grid min-w-0 gap-4">
        <legend className="mb-1 text-sm font-black uppercase tracking-wide text-z-ink">
          Persona adulta responsable
        </legend>
        <label className={labelClassName}>
          Nombre y apellidos
          <input
            name="contactName"
            required
            minLength={2}
            maxLength={100}
            autoComplete="name"
            className={fieldClassName}
            disabled={submitting}
          />
        </label>
        <label className={labelClassName}>
          Email
          <input
            name="contactEmail"
            type="email"
            required
            maxLength={254}
            autoComplete="email"
            className={fieldClassName}
            disabled={submitting}
          />
        </label>
        <label className={labelClassName}>
          <span>
            Teléfono <span className={helpClassName}>(opcional)</span>
          </span>
          <input
            name="contactPhone"
            type="tel"
            maxLength={40}
            autoComplete="tel"
            className={fieldClassName}
            disabled={submitting}
          />
        </label>
      </fieldset>

      <fieldset className="grid min-w-0 gap-4">
        <legend className="mb-1 text-sm font-black uppercase tracking-wide text-z-ink">
          Gimnasta
        </legend>
        <label className={labelClassName}>
          Nombre de pila
          <span className={helpClassName}>Solo el nombre. Los apellidos se piden más adelante si hace falta.</span>
          <input
            name="athleteGivenName"
            required
            maxLength={60}
            autoComplete="off"
            className={fieldClassName}
            disabled={submitting}
          />
        </label>
        <label className={labelClassName}>
          <span>
            Año de nacimiento <span className={helpClassName}>(opcional)</span>
          </span>
          <span className={helpClassName}>Ayuda a la academia a proponer el grupo adecuado.</span>
          <input
            name="athleteBirthYear"
            type="number"
            inputMode="numeric"
            min={1940}
            max={currentYear}
            step={1}
            className={fieldClassName}
            disabled={submitting}
          />
        </label>
      </fieldset>

      <label className={labelClassName}>
        <span>
          Comentario <span className={helpClassName}>(opcional)</span>
        </span>
        <span className={helpClassName}>
          Disciplina que os interesa o días que os vienen bien. No incluyas datos de salud.
        </span>
        <textarea
          name="message"
          rows={3}
          maxLength={500}
          className={`${fieldClassName} py-2`}
          disabled={submitting}
        />
      </label>

      {/* Honeypot: oculto a personas y lectores de pantalla. */}
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label>
          No rellenes este campo
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className="flex items-start gap-3 text-sm leading-6 text-z-ink">
        <input
          name="privacyConsent"
          type="checkbox"
          required
          className={`mt-1 h-5 w-5 shrink-0 ${FOCUS_RING}`}
          disabled={submitting}
        />
        <span>
          Acepto que {organizationName} use estos datos para responder a esta solicitud.
          Zaltyko los trata por cuenta de la academia. Consulta la{" "}
          <Link href="/politica-privacidad" className="font-semibold text-z-brand-700 underline">
            política de privacidad
          </Link>
          .
        </span>
      </label>

      {state.kind === "error" ? (
        <p role="alert" className="rounded-md border border-z-chalk-500/40 bg-z-chalk-50 p-3 text-sm font-semibold leading-6 text-z-chalk-600">
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className={`touch-target inline-flex min-h-12 items-center justify-center rounded-lg bg-z-brand-500 px-5 py-2 text-sm font-semibold text-white hover:bg-z-ink ${FOCUS_RING} disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {submitting ? "Enviando…" : "Solicitar clase de prueba"}
      </button>
    </form>
  );
}
