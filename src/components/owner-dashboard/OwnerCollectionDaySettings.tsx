"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

import { ownerField, ownerUi } from "./owner-ui";
import type { CollectionSettings } from "@/modules/family-collection/application/collection-settings-service";

// Cobro automático de cuotas (Fase 3, P2): «Día de cobro» de la academia,
// dentro de la tarjeta «Cobro automático de cuotas» de Ajustes. Por defecto,
// cada cuota se cobra el día que vence; si no, un día fijo del mes (1–31).

// Ruta relativa: el fetch es del mismo origen y el navegador añade la cabecera
// Origin que la API exige en el PUT (protección contra CSRF).
const SETTINGS_ENDPOINT = "/api/v1/owner/payments/collection-settings";
const SAVE_ERROR = "No hemos podido guardar el día de cobro. Inténtalo de nuevo.";
const DAYS = Array.from({ length: 31 }, (_, index) => index + 1);
const DEFAULT_FIXED_DAY = 1;

export type OwnerCollectionDayInitial = Pick<CollectionSettings, "collectionDayOfMonth" | "version">;

type ProblemBody = { detail?: unknown; type?: unknown } | null;

/** ¿Es el 409 de versión (`…/problems/version-conflict`)? Otra sesión guardó antes. */
function isVersionConflict(status: number, body: ProblemBody): boolean {
  return status === 409 && typeof body?.type === "string" && body.type.split("/").pop() === "version-conflict";
}

function isSettings(value: unknown): value is CollectionSettings {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<CollectionSettings>;
  return (
    (body.collectionDayOfMonth === null ||
      (Number.isInteger(body.collectionDayOfMonth) &&
        Number(body.collectionDayOfMonth) >= 1 &&
        Number(body.collectionDayOfMonth) <= 31)) &&
    Number.isInteger(body.version)
  );
}

export function OwnerCollectionDaySettings({
  organizationId,
  initial,
}: {
  organizationId: string;
  initial: OwnerCollectionDayInitial;
}) {
  const idPrefix = useId();
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [mode, setMode] = useState<"due" | "fixed">(initial.collectionDayOfMonth === null ? "due" : "fixed");
  const [day, setDay] = useState(initial.collectionDayOfMonth ?? DEFAULT_FIXED_DAY);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [message, setMessage] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  // Tras router.refresh() (p. ej. por un conflicto de versión) llega el día
  // guardado en el servidor: manda sobre lo que hay en pantalla.
  useEffect(() => {
    setSaved({ collectionDayOfMonth: initial.collectionDayOfMonth, version: initial.version });
    setMode(initial.collectionDayOfMonth === null ? "due" : "fixed");
    setDay(initial.collectionDayOfMonth ?? DEFAULT_FIXED_DAY);
  }, [initial.collectionDayOfMonth, initial.version]);

  const chosen = mode === "due" ? null : day;
  const unchanged = chosen === saved.collectionDayOfMonth;

  async function save() {
    if (busyRef.current || unchanged) return;
    busyRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(SETTINGS_ENDPOINT, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          organizationId,
          collectionDayOfMonth: chosen,
          expectedVersion: saved.version,
        }),
      });
      const body = (await response.json().catch(() => null)) as unknown;
      if (response.ok && isSettings(body)) {
        setSaved({ collectionDayOfMonth: body.collectionDayOfMonth, version: body.version });
        setMessage({ tone: "info", text: "Día de cobro guardado." });
      } else {
        const detail = (body as ProblemBody)?.detail;
        setMessage({
          tone: "error",
          text: !response.ok && typeof detail === "string" && detail.trim() ? detail : SAVE_ERROR,
        });
        // Otra sesión cambió el día: se relee la página con la versión nueva.
        if (isVersionConflict(response.status, body as ProblemBody)) router.refresh();
      }
    } catch {
      setMessage({ tone: "error", text: SAVE_ERROR });
    }
    busyRef.current = false;
    setBusy(false);
  }

  const daySelectId = `${idPrefix}-day`;
  const notesId = `${idPrefix}-notes`;

  return (
    <section aria-labelledby={`${idPrefix}-title`} className="grid gap-3">
      <h3 id={`${idPrefix}-title`} className={ownerUi.label}>
        Día de cobro
      </h3>
      <fieldset className="grid gap-2" disabled={busy}>
        <legend className="sr-only">Cuándo se cobra cada cuota</legend>
        <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-z-line bg-white px-3 py-2">
          <input
            type="radio"
            name={`${idPrefix}-mode`}
            value="due"
            checked={mode === "due"}
            onChange={() => setMode("due")}
            className="size-4 accent-z-brand-500"
          />
          <span className="text-sm font-semibold text-z-ink">El día que vence cada cuota</span>
        </label>
        <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-z-line bg-white px-3 py-2">
          <input
            type="radio"
            name={`${idPrefix}-mode`}
            value="fixed"
            checked={mode === "fixed"}
            onChange={() => setMode("fixed")}
            className="size-4 accent-z-brand-500"
          />
          <span className="text-sm font-semibold text-z-ink">Un día fijo del mes</span>
        </label>
      </fieldset>

      {mode === "fixed" ? (
        <div className="grid gap-2">
          <label htmlFor={daySelectId} className={ownerUi.label}>
            Día del mes
          </label>
          <select
            id={daySelectId}
            value={day}
            disabled={busy}
            aria-describedby={notesId}
            onChange={(event) => setDay(Number(event.target.value))}
            className={`${ownerField} max-w-40`}
          >
            {DAYS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
          <ul id={notesId} className={`${ownerUi.help} grid gap-1`}>
            <li>En los meses que no tienen ese día, se cobra el último día del mes.</li>
            <li>Si ese día cae antes del vencimiento, se cobra el día del vencimiento.</li>
          </ul>
        </div>
      ) : null}

      {message ? (
        <p
          role={message.tone === "error" ? "alert" : "status"}
          className={message.tone === "error" ? ownerUi.noticeError : ownerUi.noticeInfo}
        >
          {message.text}
        </p>
      ) : null}

      <div>
        <button
          type="button"
          className={ownerUi.secondaryButton}
          disabled={busy || unchanged}
          aria-busy={busy || undefined}
          onClick={() => void save()}
        >
          {busy ? "Guardando…" : "Guardar día de cobro"}
        </button>
      </div>
    </section>
  );
}
