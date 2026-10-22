"use client";
import { useState } from "react";
import {
  EntryDataSchema,
  type EntryData,
  type DirectoryKind,
} from "@/lib/directory/contracts";
export const inputClass =
  "block w-full rounded-lg border border-border bg-background p-3";
export const buttonClass =
  "min-h-11 rounded-lg bg-primary px-4 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 text-primary-foreground disabled:opacity-50";
export function EntryEditor({
  initial,
  kind,
  onSave,
}: {
  initial?: EntryData;
  kind: DirectoryKind;
  onSave: (data: EntryData) => Promise<void>;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<EntryData | null>(null);
  function read(form: HTMLFormElement) {
    const values = new FormData(form),
      data: Record<string, unknown> = { ...initial };
    for (const [key, value] of values.entries())
      data[key] = String(value).trim() || null;
    data.disciplines = values.getAll("disciplines");
    data.description = data.description ?? "";
    return EntryDataSchema.parse(data);
  }
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setError("");
        try {
          const data = read(e.currentTarget);
          if (!preview || JSON.stringify(preview) !== JSON.stringify(data)) {
            setPreview(data);
            return;
          }
          setBusy(true);
          await onSave(data);
          setPreview(null);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Revisa los campos");
        } finally {
          setBusy(false);
        }
      }}
      className="space-y-4"
    >
      <p>
        Solo información pública contrastada. Los campos desconocidos se dejan
        vacíos. Una ficha representa una sede física.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          ["name", "Nombre", true],
          ["countryCode", "País (código ISO: ES, PE, BR…)", true],
          ["region", "Región", false],
          ["city", "Localidad", false],
          ["address", "Dirección", false],
          ["sourceName", "Nombre de la fuente", true],
          ["sourceUrl", "Fuente oficial (HTTPS)", true],
          ["website", "Web oficial (HTTPS)", false],
          ["imageUrl", "Imagen o logotipo autorizado (HTTPS)", false],
          ["imageSourceUrl", "Procedencia de la imagen (HTTPS)", false],
          [
            "imageLicense",
            "Licencia o autorización documentada de la imagen",
            false,
          ],
          ["contactEmail", "Correo institucional público", false],
          ["contactPhone", "Teléfono público de la entidad", false],
          ["socialInstagram", "Instagram oficial (HTTPS)", false],
          ["socialFacebook", "Facebook oficial (HTTPS)", false],
          ["hours", "Horarios publicados", false],
          ...(kind === "event"
            ? [
                ["organizerName", "Organizador real", true],
                ["organizerUrl", "Web del organizador", false],
                ["edition", "Edición", false],
                ["startDate", "Fecha de inicio", false],
                ["endDate", "Fecha final", false],
                ["startTime", "Hora conocida", false],
                [
                  "timezone",
                  "Zona horaria (Europe/Madrid, America/Lima…)",
                  false,
                ],
                ["venue", "Recinto", false],
                ["registrationUrl", "Inscripción oficial (HTTPS)", false],
                ["registrationEndDate", "Último día de inscripción", false],
                ["participantRequirements", "Requisitos para competir", false],
              ]
            : []),
        ].map(([key, label, required]) => (
          <label key={String(key)} className="text-sm">
            {String(label)}
            {required ? " *" : ""}
            <input
              name={String(key)}
              required={Boolean(required)}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "entry-error" : undefined}
              type={
                String(key).includes("Date")
                  ? "date"
                  : key === "startTime"
                    ? "time"
                    : "text"
              }
              defaultValue={String(initial?.[key as keyof EntryData] ?? "")}
              className={inputClass}
            />
          </label>
        ))}
      </div>
      <label className="block">
        Descripción propia
        <textarea
          name="description"
          defaultValue={initial?.description ?? ""}
          rows={4}
          className={inputClass}
        />
      </label>
      <fieldset>
        <legend>Modalidades</legend>
        <div className="flex flex-wrap gap-4">
          {Object.entries({
            artistic_female: "Artística femenina",
            artistic_male: "Artística masculina",
            rhythmic: "Rítmica",
            trampoline: "Trampolín",
            aerobic: "Aeróbica",
            acrobatics: "Acrobática",
            parkour: "Parkour",
            general: "General",
          }).map(([value, label]) => (
            <label key={value}>
              <input
                type="checkbox"
                name="disciplines"
                value={value}
                defaultChecked={initial?.disciplines.includes(
                  value as EntryData["disciplines"][number]
                )}
              />{" "}
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block">
        Actividad
        <select
          name="activity"
          defaultValue={initial?.activity ?? "unknown"}
          className={inputClass}
        >
          <option value="unknown">Desconocida</option>
          <option value="operational">Operativa</option>
          <option value="closed">Cerrada</option>
        </select>
      </label>
      {kind === "event" && (
        <div className="grid gap-4 sm:grid-cols-3">
          <label>
            Tipo
            <select
              name="eventType"
              defaultValue={initial?.eventType ?? "competitions"}
              className={inputClass}
            >
              {Object.entries({
                competitions: "Competición",
                courses: "Curso",
                camps: "Campus",
                workshops: "Taller",
                clinics: "Clínic",
                evaluations: "Evaluación",
                other: "Otro",
              }).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Situación
            <select
              name="eventStatus"
              defaultValue={initial?.eventStatus ?? "provisional"}
              className={inputClass}
            >
              {Object.entries({
                provisional: "Provisional",
                confirmed: "Confirmado",
                postponed: "Aplazado",
                cancelled: "Cancelado",
                finished: "Finalizado",
              }).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            Acceso de espectadores
            <select
              name="spectatorAccess"
              defaultValue={initial?.spectatorAccess ?? "unknown"}
              className={inputClass}
            >
              <option value="unknown">Sin confirmar</option>
              <option value="public">Público</option>
              <option value="restricted">Restringido</option>
            </select>
          </label>
        </div>
      )}
      {error && (
        <p id="entry-error" role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {preview && (
        <section aria-label="Vista previa" className="rounded-xl border p-4">
          <h3 className="text-xl font-semibold">{preview.name}</h3>
          <p>
            {preview.city}, {preview.countryCode}
          </p>
          <p className="whitespace-pre-wrap">{preview.description}</p>
          <p>
            Fuente: {preview.sourceName} · {preview.sourceUrl}
          </p>
          {kind === "event" && (
            <p>
              {preview.startDate ?? "Fecha sin confirmar"} ·{" "}
              {preview.organizerName}
            </p>
          )}
          <p>Confirma tras contrastar los datos con la fuente.</p>
        </section>
      )}
      <button disabled={busy} className={buttonClass}>
        {busy
          ? "Guardando…"
          : preview
            ? "Confirmar y guardar"
            : "Previsualizar ficha"}
      </button>
    </form>
  );
}
export async function directoryFetch(
  path: string,
  body?: unknown,
  method = "POST"
) {
  const response = await fetch(path, {
    method: body ? method : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json();
  if (!response.ok || !json.ok)
    throw new Error(json.message ?? "No se pudo completar");
  return json.data;
}
