"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ImportExportPanelProps {
  tenantId?: string;
  academyId?: string;
  onImported?: (summary: ImportSummary) => void;
}

type ImportSummary = {
  total: number;
  created: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
  potentialDuplicates?: number;
  dryRun?: boolean;
  previewHash?: string;
  requiresConfirmation?: boolean;
  batchId?: string;
  status?: "processing" | "completed" | "failed" | "rolled_back";
  rolledBackCount?: number;
};

export default function ImportExportPanel({ tenantId, academyId, onImported }: ImportExportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [previewHash, setPreviewHash] = useState<string | null>(null);
  const [rollbackArmed, setRollbackArmed] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [customTenantId, setCustomTenantId] = useState(tenantId ?? "");

  const templateCsv = [
    "name,dob,level,status,groupId,groupName,sportConfigCode,programCode,levelCode,categoryCode",
    "Lucía Márquez,2010-05-14,Base 3,active,,Artística Femenina Base 3,ES:artistic_female,base,base_3,infantil",
    "Martín Ortega,2011-09-02,Iniciación,active,,Artística Masculina Iniciación,ES:artistic_male,recreativo,,alevin",
  ]
    .map((line) => line.trim())
    .join("\n");

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(templateCsv)}`;

  const upload = async (dryRun: boolean) => {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setMessage("Selecciona un archivo CSV antes de importar.");
      return false;
    }

    const effectiveTenantId = tenantId ?? (customTenantId.trim() || undefined);

    if (!effectiveTenantId) {
      setMessage("Indica el tenant ID para importar.");
      return false;
    }

    setIsUploading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("tenantId", effectiveTenantId);
    formData.append("dryRun", String(dryRun));
    if (!dryRun) {
      formData.append("confirm", "true");
      if (previewHash) formData.append("previewHash", previewHash);
    }
    if (academyId) formData.append("academyId", academyId);

    try {
      const response = await fetch("/api/athletes/import", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.message ?? error?.error ?? "No se pudo importar el archivo.");
      }

      const responseBody = (await response.json()) as { data?: ImportSummary } & Partial<ImportSummary>;
      const data = responseBody.data ?? (responseBody as ImportSummary);
      setSummary(data);
      if (dryRun) {
        setPreviewHash(data.previewHash ?? null);
        setRollbackArmed(false);
        setMessage(
          `Vista previa lista: ${data.created} se crearán y ${data.skipped} requieren revisión de ${data.total} filas.`
        );
      } else {
        setPreviewHash(null);
        setRollbackArmed(false);
        setMessage(
          `Importación completada: ${data.created} creados, ${data.skipped} omitidos de ${data.total} filas.`
        );
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        onImported?.(data);
      }
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Error durante la importación.");
      // Nunca conservar una vista previa anterior tras un fallo: podría
      // mostrar al usuario un recuento que ya no corresponde al archivo.
      setSummary(null);
      setPreviewHash(null);
      setRollbackArmed(false);
      return false;
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await upload(true);
  };

  const handleConfirm = async () => {
    await upload(false);
  };

  const handleRollback = async () => {
    if (!summary?.batchId) return;

    setIsRollingBack(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/athletes/import/${summary.batchId}/rollback`, {
        method: "POST",
      });
      const responseBody = (await response.json().catch(() => ({}))) as {
        data?: { rolledBackCount?: number; status?: ImportSummary["status"] };
        message?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(
          responseBody.message ?? responseBody.error ?? "No se pudo deshacer la importación.",
        );
      }
      const rolledBackCount = responseBody.data?.rolledBackCount ?? summary.created;
      setSummary((current) =>
        current
          ? { ...current, status: "rolled_back", rolledBackCount }
          : current,
      );
      setRollbackArmed(false);
      setMessage(`Importación deshecha: ${rolledBackCount} gimnastas archivadas.`);
      onImported?.({ ...summary, status: "rolled_back", rolledBackCount });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo deshacer la importación.");
    } finally {
      setIsRollingBack(false);
    }
  };

  const exportTenantId = tenantId ?? (customTenantId.trim() || undefined);
  const exportUrl = exportTenantId
    ? `/api/athletes/export?tenantId=${encodeURIComponent(exportTenantId)}`
    : "/api/athletes/export";

  return (
    <div className="w-full space-y-4">
      <p className="text-sm text-muted-foreground">
        Descarga la plantilla, complétala con tus gimnastas y súbela aquí. Si conoces el grupo o la
        configuración deportiva de cada una, añade esas columnas para que queden ya asignadas.
      </p>

      {!tenantId && (
        <div className="space-y-1 text-sm">
          <Label htmlFor="tenantId">Tenant ID</Label>
          <Input
            id="tenantId"
            value={customTenantId}
            onChange={(event) => setCustomTenantId(event.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
          />
        </div>
      )}

      <Button asChild variant="outline" className="w-full">
        <a href={templateHref} download="athletes-template.csv">
          Descargar plantilla CSV
        </a>
      </Button>

      <form onSubmit={handleSubmit} className="space-y-3">
        <Label htmlFor="athlete-csv-file">Archivo CSV</Label>
        <input
          ref={fileInputRef}
          id="athlete-csv-file"
          type="file"
          accept=".csv,text/csv"
          disabled={isUploading}
          onChange={() => {
            setSummary(null);
            setPreviewHash(null);
            setRollbackArmed(false);
            setMessage(null);
          }}
          className="w-full rounded-md border border-dashed border-border px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-emerald-500/10 file:px-3 file:py-1 file:text-sm file:font-medium file:text-emerald-600"
        />
        <Button type="submit" className="w-full" disabled={isUploading}>
          {isUploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Importando...
            </>
          ) : (
            "Previsualizar importación"
          )}
        </Button>
      </form>

      {summary?.dryRun && summary.created > 0 && (
        <div className="space-y-3 rounded-xl border border-zaltyko-teal/30 bg-zaltyko-teal/5 p-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Revisa antes de crear</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Se crearán {summary.created} gimnastas. Las filas con errores no se tocarán. Esta
              confirmación solo acepta el mismo archivo que acabas de previsualizar.
            </p>
            {summary.potentialDuplicates ? (
              <p className="mt-2 text-xs font-medium text-amber-400">
                {summary.potentialDuplicates} posible{summary.potentialDuplicates === 1 ? "" : "s"} duplicado{summary.potentialDuplicates === 1 ? "" : "s"} detectado{summary.potentialDuplicates === 1 ? "" : "s"}; revisa las filas antes de confirmar.
              </p>
            ) : null}
          </div>
          <Button type="button" className="w-full" onClick={handleConfirm} disabled={isUploading || !previewHash}>
            {isUploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creando gimnastas...
              </>
            ) : (
              `Confirmar e importar ${summary.created} ${summary.created === 1 ? "gimnasta" : "gimnastas"}`
            )}
          </Button>
        </div>
      )}

      {summary?.batchId && summary.status !== "rolled_back" && summary.created > 0 && (
        <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div>
            <p className="text-sm font-semibold text-amber-300">¿Necesitas corregir algo?</p>
            <p className="mt-1 text-xs text-amber-200">
              Puedes archivar de una vez las {summary.created} gimnastas creadas por este lote. No
              afecta a registros anteriores.
            </p>
          </div>
          {!rollbackArmed ? (
            <Button
              type="button"
              variant="outline"
              className="w-full border-amber-500/50 text-amber-300 hover:bg-amber-500/15"
              onClick={() => setRollbackArmed(true)}
              disabled={isRollingBack}
            >
              Deshacer esta importación
            </Button>
          ) : (
            <div className="space-y-2">
                <p className="text-xs font-semibold text-amber-300">
                Confirma para archivar únicamente las gimnastas de este lote.
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-amber-300"
                  onClick={() => setRollbackArmed(false)}
                  disabled={isRollingBack}
                >
                  Cancelar
                </Button>
                <Button
                  type="button"
                  className="w-full bg-amber-700 text-white hover:bg-amber-800"
                  onClick={handleRollback}
                  disabled={isRollingBack}
                >
                  {isRollingBack ? "Deshaciendo..." : "Sí, deshacer importación"}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {summary?.status === "rolled_back" && (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-400">
          Esta importación ya está archivada y no volverá a aparecer entre las gimnastas activas.
        </p>
      )}

      <Button asChild variant="ghost" className="w-full justify-start text-left text-sm text-muted-foreground">
        <a href={exportUrl} download>
          Exportar listado actual (XLSX)
        </a>
      </Button>

      {message && (
        <p role="status" aria-live="polite" className="text-sm text-emerald-600 dark:text-emerald-400">
          {message}
        </p>
      )}

      {summary && summary.errors.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-md border border-dashed border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-300">
          <p className="font-semibold">Filas con errores</p>
          <ul className="list-disc pl-4">
            {summary.errors.map((error) => (
              <li key={`${error.row}-${error.reason}`}>
                Fila {error.row}: {error.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
