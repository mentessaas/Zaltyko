"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";

import {
  ATHLETE_IMPORT_FIELD_LABELS,
  ATHLETE_IMPORT_FIELDS,
  REQUIRED_IMPORT_FIELDS,
  athleteImportIssuesCsv,
  athleteImportTemplateCsv,
  type AthleteImportField,
  type AthleteImportMapping,
} from "@/modules/athlete-import/domain/athlete-import-rows";

import { athleteImportTemplateXlsx } from "./athlete-import-template";
import { ownerUi } from "./owner-ui";

const PREVIEW_ENDPOINT = "/api/v1/owner/athlete-import/preview";
const CONFIRM_ENDPOINT = "/api/v1/owner/athlete-import/confirm";

type RowStatus = "create" | "error" | "duplicate" | "skipped";

type PreviewRow = {
  row: number;
  status: RowStatus;
  issues: Array<{ severity: "error" | "warning"; field: string | null; code: string; message: string }>;
  values: {
    givenName: string;
    familyName: string;
    dateOfBirth: string | null;
    group: string | null;
    guardianName: string | null;
    guardianEmail: string | null;
    guardianPhone: string | null;
  };
};

export type AthleteImportPreviewResponse = {
  format: "csv" | "xlsx";
  headers: string[];
  mapping: AthleteImportMapping;
  mappingProblems: string[];
  hiddenRows: number[];
  rows: PreviewRow[];
  summary: {
    total: number;
    toCreate: number;
    errors: number;
    duplicates: number;
    skipped: number;
    withWarnings: number;
    newFamilies: number;
    newTutors: number;
    groupMemberships: number;
  };
  plan: { current: number; limit: number | null; readOnly: boolean };
  canConfirm: boolean;
  previewToken: string;
};

type ImportResult = {
  batchId: string;
  created: Array<{ row: number; athleteId: string }>;
  skipped: Array<{ row: number; code: string; message: string }>;
  replayed: boolean;
};

const STATUS_LABELS: Record<RowStatus, string> = {
  create: "Se crea",
  error: "Error",
  duplicate: "Duplicada",
  skipped: "No se importa",
};

const STATUS_CLASSES: Record<RowStatus, string> = {
  create: "bg-emerald-50 text-emerald-900",
  error: "bg-rose-50 text-rose-900",
  duplicate: "bg-amber-50 text-amber-950",
  skipped: "bg-amber-50 text-amber-950",
};

async function readProblem(response: Response, fallback: string): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { detail?: unknown } | null;
  return typeof payload?.detail === "string" ? payload.detail : fallback;
}

function download(name: string, content: string | Uint8Array<ArrayBuffer>, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function newKey(): string {
  return `owner-athlete-import:${crypto.randomUUID()}`;
}

export function OwnerAthleteImportWorkspace({
  organizationId,
  organizationName,
}: {
  organizationId: string;
  organizationName: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<AthleteImportPreviewResponse | null>(null);
  const [mapping, setMapping] = useState<AthleteImportMapping | null>(null);
  const [mappingDirty, setMappingDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  // One key per previewed file and mapping: a retry after a lost response
  // replays the same import instead of creating it twice.
  const [confirmKey, setConfirmKey] = useState<{ token: string; key: string } | null>(null);
  const [legalConfirmed, setLegalConfirmed] = useState(false);
  const query = `?organizationId=${encodeURIComponent(organizationId)}`;

  const problemRows = useMemo(
    () => (preview?.rows ?? []).filter((row) => row.status !== "create"),
    [preview]
  );

  async function requestPreview(nextMapping: AthleteImportMapping | null) {
    if (!file) {
      setError("Elige primero un fichero CSV o Excel (.xlsx).");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const form = new FormData();
      form.set("file", file);
      if (nextMapping) form.set("mapping", JSON.stringify(nextMapping));
      const response = await fetch(`${PREVIEW_ENDPOINT}${query}`, { method: "POST", body: form });
      if (!response.ok) {
        setPreview(null);
        setError(await readProblem(response, "No se pudo leer el fichero. Revísalo e inténtalo de nuevo."));
        return;
      }
      const payload = (await response.json()) as { data: AthleteImportPreviewResponse };
      setPreview(payload.data);
      setMapping(payload.data.mapping);
      setMappingDirty(false);
    } catch {
      setError("No se pudo contactar con el servidor. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport() {
    if (!preview || !file || !mapping || !preview.canConfirm || !legalConfirmed) return;
    const key =
      confirmKey && confirmKey.token === preview.previewToken ? confirmKey.key : newKey();
    setConfirmKey({ token: preview.previewToken, key });
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("mapping", JSON.stringify(mapping));
      form.set("previewToken", preview.previewToken);
      form.set("legalBasisConfirmed", "true");
      const response = await fetch(`${CONFIRM_ENDPOINT}${query}`, {
        method: "POST",
        headers: { "Idempotency-Key": key },
        body: form,
      });
      if (!response.ok) {
        setError(await readProblem(response, "No se pudo completar la importación. No se ha creado nada."));
        return;
      }
      const payload = (await response.json()) as { data: ImportResult };
      setResult(payload.data);
    } catch {
      setError(
        "No se recibió la respuesta. Vuelve a pulsar «Importar»: se repite la misma operación y no se duplicará nada."
      );
    } finally {
      setBusy(false);
    }
  }

  function updateMapping(field: AthleteImportField, value: string) {
    if (!mapping) return;
    setMapping({ ...mapping, [field]: value === "" ? null : Number(value) });
    setMappingDirty(true);
  }

  const summary = preview?.summary;

  return (
    <main className={ownerUi.page}>
      <header className={ownerUi.pageHeader}>
        <Link href={`/owner/athletes?organizationId=${encodeURIComponent(organizationId)}`} className={ownerUi.backLink}>
          ← Gimnastas
        </Link>
        <p className={ownerUi.eyebrow}>{organizationName}</p>
        <h1 className={ownerUi.pageTitle}>Importar gimnastas</h1>
        <p className={ownerUi.pageLead}>
          Sube tu Excel o CSV con las gimnastas y, si quieres, sus tutores y su grupo. Verás una vista previa
          con lo que se va a crear antes de guardar nada.
        </p>
      </header>

      <section className={`${ownerUi.card} grid gap-4`} aria-labelledby="athlete-import-file">
        <h2 id="athlete-import-file" className={ownerUi.sectionTitle}>
          1. Fichero
        </h2>
        <p className={ownerUi.muted}>
          Columnas obligatorias: nombre y apellidos. Opcionales: fecha de nacimiento (DD/MM/AAAA), grupo y
          datos del tutor. Máximo 1.000 filas y 2 MB.
        </p>
        <p className={ownerUi.muted}>
          <strong>Teléfono del tutor:</strong> con prefijo internacional y sin espacios, por ejemplo{" "}
          <code>+34600000000</code>. «+34 600 000 000» o «600000000» no se aceptan, igual que en la ficha del
          tutor. Si escribes en Excel sobre la plantilla CSV, empieza por un apóstrofo (<code>&apos;+34600000000</code>)
          para que Excel no lo convierta en número; la plantilla Excel ya trae esa columna como texto.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className={ownerUi.secondaryButton}
            onClick={() => download("plantilla-gimnastas-zaltyko.csv", athleteImportTemplateCsv())}
          >
            Descargar plantilla CSV
          </button>
          <button
            type="button"
            className={ownerUi.secondaryButton}
            onClick={() =>
              void athleteImportTemplateXlsx().then(
                (bytes) =>
                  download(
                    "plantilla-gimnastas-zaltyko.xlsx",
                    bytes,
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  ),
                () => setError("No se pudo generar la plantilla de Excel. Usa la plantilla CSV.")
              )
            }
          >
            Descargar plantilla Excel
          </button>
        </div>
        <label className="grid gap-2">
          <span className={ownerUi.label}>Fichero CSV o Excel (.xlsx)</span>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className={ownerUi.field}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPreview(null);
              setMapping(null);
              setResult(null);
              setConfirmKey(null);
              setLegalConfirmed(false);
              setError("");
            }}
          />
        </label>
        <div>
          <button
            type="button"
            className={ownerUi.primaryButton}
            disabled={!file || busy}
            onClick={() => void requestPreview(null)}
          >
            Ver vista previa
          </button>
        </div>
      </section>

      {error ? (
        <p role="alert" className="mt-5 rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-950">
          {error}
        </p>
      ) : null}

      {preview && mapping ? (
        <section className={`${ownerUi.card} mt-5 grid gap-4`} aria-labelledby="athlete-import-mapping">
          <h2 id="athlete-import-mapping" className={ownerUi.sectionTitle}>
            2. Columnas
          </h2>
          <p className={ownerUi.muted}>Revisa qué columna de tu fichero corresponde a cada dato.</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ATHLETE_IMPORT_FIELDS.map((field) => (
              <label key={field} className="grid gap-1">
                <span className={ownerUi.label}>
                  {ATHLETE_IMPORT_FIELD_LABELS[field]}
                  {REQUIRED_IMPORT_FIELDS.includes(field) ? " (obligatoria)" : ""}
                </span>
                <select
                  className={ownerUi.field}
                  value={mapping[field] === null ? "" : String(mapping[field])}
                  onChange={(event) => updateMapping(field, event.target.value)}
                >
                  <option value="">— Sin columna —</option>
                  {preview.headers.map((header, index) => (
                    <option key={`${header}-${index}`} value={String(index)}>
                      {header || `Columna ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          {preview.mappingProblems.length > 0 ? (
            <ul role="alert" className="grid gap-1 rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-950">
              {preview.mappingProblems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          ) : null}
          {mappingDirty ? (
            <div>
              <button
                type="button"
                className={ownerUi.primaryButton}
                disabled={busy}
                onClick={() => void requestPreview(mapping)}
              >
                Actualizar vista previa
              </button>
            </div>
          ) : null}
        </section>
      ) : null}

      {preview && summary && preview.mappingProblems.length === 0 ? (
        <section className={`${ownerUi.card} mt-5 grid gap-4`} aria-labelledby="athlete-import-preview">
          <h2 id="athlete-import-preview" className={ownerUi.sectionTitle}>
            3. Vista previa
          </h2>
          <p className={ownerUi.muted} data-testid="athlete-import-summary">
            {plural(summary.total, "fila", "filas")}: se crearán {plural(summary.toCreate, "gimnasta", "gimnastas")},{" "}
            {plural(summary.newFamilies, "familia", "familias")}, {plural(summary.newTutors, "tutor", "tutores")} y{" "}
            {plural(summary.groupMemberships, "alta en grupo", "altas en grupos")}.{" "}
            {plural(summary.errors, "fila con errores", "filas con errores")},{" "}
            {plural(summary.duplicates, "duplicada", "duplicadas")} y{" "}
            {plural(summary.skipped, "que no se importa", "que no se importan")}.
          </p>
          {preview.plan.limit !== null ? (
            <p className={ownerUi.help}>
              Tu plan admite {preview.plan.limit} gimnastas y ya tienes {preview.plan.current}.
            </p>
          ) : null}
          {preview.hiddenRows.length > 0 ? (
            <p role="note" className="rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950">
              Las filas ocultas o filtradas del Excel no se importan ({preview.hiddenRows.length}):{" "}
              {preview.hiddenRows.slice(0, 20).join(", ")}
              {preview.hiddenRows.length > 20 ? "…" : ""}. Muéstralas en el Excel si quieres importarlas.
            </p>
          ) : null}
          <details className={ownerUi.subtlePanel}>
            <summary className="cursor-pointer text-sm font-semibold text-z-ink">Qué significa cada resultado</summary>
            <dl className="mt-3 grid gap-2 text-sm">
              <div>
                <dt className="font-semibold">Se crea</dt>
                <dd>La fila es válida y se dará de alta al confirmar.</dd>
              </div>
              <div>
                <dt className="font-semibold">Error</dt>
                <dd>Falta un dato o no es válido. Corrígelo en el fichero y vuelve a subirlo.</dd>
              </div>
              <div>
                <dt className="font-semibold">Duplicada</dt>
                <dd>
                  Ya existe en la academia, o se repite en el fichero, una gimnasta con el mismo nombre y la misma
                  fecha de nacimiento (o sin fecha para distinguirlas). No se crea otra.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">No se importa</dt>
                <dd>Es válida, pero su grupo está lleno o supera el límite de tu plan.</dd>
              </div>
              <div>
                <dt className="font-semibold">Aviso</dt>
                <dd>Se importa, pero conviene revisar lo que indica.</dd>
              </div>
              <div>
                <dt className="font-semibold">Familia y tutor</dt>
                <dd>
                  Las hermanas con el mismo email o teléfono de tutor comparten familia. Si el tutor ya está en la
                  academia con el mismo nombre, se usa su familia. Sin tutor se crea una familia incompleta, como en
                  el alta manual.
                </dd>
              </div>
            </dl>
          </details>
          {preview.plan.readOnly ? (
            <p role="alert" className="rounded-lg border border-amber-400 bg-amber-50 p-4 text-sm text-amber-950">
              La academia está en solo lectura porque supera los límites del plan. No se puede importar hasta
              regularizarla desde Plan.
            </p>
          ) : null}
          {problemRows.length > 0 ? (
            <div>
              <button
                type="button"
                className={ownerUi.secondaryButton}
                onClick={() =>
                  download(
                    "filas-a-revisar.csv",
                    athleteImportIssuesCsv(
                      problemRows.map((row) => ({
                        row: row.row,
                        values: row.values,
                        messages: row.issues.filter((item) => item.severity === "error").map((item) => item.message),
                      }))
                    )
                  )
                }
              >
                Descargar filas a revisar
              </button>
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <caption className="sr-only">Filas del fichero y lo que se hará con cada una</caption>
              <thead>
                <tr className="border-b border-z-line text-z-soft">
                  <th scope="col" className="py-2 pr-3">Fila</th>
                  <th scope="col" className="py-2 pr-3">Gimnasta</th>
                  <th scope="col" className="py-2 pr-3">Nacimiento</th>
                  <th scope="col" className="py-2 pr-3">Grupo</th>
                  <th scope="col" className="py-2 pr-3">Tutor</th>
                  <th scope="col" className="py-2 pr-3">Resultado</th>
                  <th scope="col" className="py-2">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.row} className="border-b border-z-line align-top">
                    <td className="py-2 pr-3 tabular-nums">{row.row}</td>
                    <td className="py-2 pr-3">
                      {row.values.givenName} {row.values.familyName}
                    </td>
                    <td className="py-2 pr-3">{row.values.dateOfBirth ?? "—"}</td>
                    <td className="py-2 pr-3">{row.values.group ?? "—"}</td>
                    <td className="py-2 pr-3">{row.values.guardianName ?? "—"}</td>
                    <td className="py-2 pr-3">
                      <span className={`rounded px-2 py-0.5 text-xs font-semibold ${STATUS_CLASSES[row.status]}`}>
                        {STATUS_LABELS[row.status]}
                      </span>
                    </td>
                    <td className="py-2">
                      {row.issues.length > 0 ? (
                        <ul className="grid gap-1">
                          {row.issues.map((item) => (
                            <li
                              key={`${item.code}-${item.field ?? ""}`}
                              className={item.severity === "error" ? "text-rose-900" : "text-amber-900"}
                            >
                              {item.severity === "error" ? "Error: " : "Aviso: "}
                              {item.message}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!result ? (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex w-full items-start gap-2 text-sm text-z-ink">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4"
                  checked={legalConfirmed}
                  onChange={(event) => setLegalConfirmed(event.target.checked)}
                />
                <span>
                  Declaro que tengo base legal para tratar estos datos y que he informado a las familias.
                </span>
              </label>
              <button
                type="button"
                className={ownerUi.primaryButton}
                disabled={!preview.canConfirm || mappingDirty || busy || !legalConfirmed}
                onClick={() => void confirmImport()}
              >
                Importar {plural(summary.toCreate, "gimnasta", "gimnastas")}
              </button>
              {mappingDirty ? (
                <span className={ownerUi.help}>Actualiza la vista previa antes de importar.</span>
              ) : null}
              {!legalConfirmed && preview.canConfirm ? (
                <span className={ownerUi.help}>Marca la declaración para poder importar.</span>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {result ? (
        <section
          role="status"
          className={`${ownerUi.card} mt-5 grid gap-3`}
          aria-labelledby="athlete-import-result"
        >
          <h2 id="athlete-import-result" className={ownerUi.sectionTitle}>
            Importación completada
          </h2>
          <p className={ownerUi.muted}>
            Gimnastas creadas: {result.created.length}. Filas no importadas: {result.skipped.length}.
          </p>
          {result.skipped.length > 0 ? (
            <ul className="grid gap-1 text-sm">
              {result.skipped.map((item) => (
                <li key={item.row}>
                  Fila {item.row}: {item.message}
                </li>
              ))}
            </ul>
          ) : null}
          <div>
            <Link
              href={`/owner/athletes?organizationId=${encodeURIComponent(organizationId)}`}
              className={ownerUi.textLink}
            >
              Ir a Gimnastas
            </Link>
          </div>
        </section>
      ) : null}
    </main>
  );
}
