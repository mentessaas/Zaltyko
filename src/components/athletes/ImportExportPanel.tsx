"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ImportExportPanelProps {
  tenantId?: string;
}

type ImportSummary = {
  total: number;
  created: number;
  skipped: number;
  errors: Array<{ row: number; reason: string }>;
};

export default function ImportExportPanel({ tenantId }: ImportExportPanelProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [customTenantId, setCustomTenantId] = useState(tenantId ?? "");

  const templateCsv = [
    "name,academyId,dob,level,status",
    "Lucía Márquez,ACADEMY_UUID,2010-05-14,FIG 5,active",
    "Martín Ortega,ACADEMY_UUID,2011-09-02,FIG 4,active",
  ]
    .map((line) => line.trim())
    .join("\n");

  const templateHref = `data:text/csv;charset=utf-8,${encodeURIComponent(templateCsv)}`;

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setMessage("Selecciona un archivo CSV antes de importar.");
      return;
    }

    const effectiveTenantId = tenantId ?? (customTenantId.trim() || undefined);

    if (!effectiveTenantId) {
      setMessage("Indica el tenant ID para importar.");
      return;
    }

    setIsUploading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("tenantId", effectiveTenantId);

    try {
      const response = await fetch("/api/athletes/import", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error?.error ?? "No se pudo importar el archivo.");
      }

      const data = (await response.json()) as ImportSummary;
      setSummary(data);
      setMessage(
        `Importación completada: ${data.created} creados, ${data.skipped} omitidos de ${data.total} filas.`
      );
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : "Error durante la importación.");
      setSummary(null);
    } finally {
      setIsUploading(false);
    }
  };

  const exportTenantId = tenantId ?? (customTenantId.trim() || undefined);
  const exportUrl = exportTenantId
    ? `/api/athletes/export?tenantId=${encodeURIComponent(exportTenantId)}`
    : "/api/athletes/export";

  return (
    <div className="w-full max-w-xs space-y-4 rounded-lg border bg-card p-4 shadow">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Importar / Exportar</h2>
        <p className="text-sm text-muted-foreground">
          Carga atletas desde CSV (columnas: name, academyId, dob, level, status) o descarga el
          listado en XLSX.
        </p>
      </div>

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

      <form onSubmit={handleSubmit} className="space-y-3">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="w-full rounded-md border border-dashed border-border px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-emerald-500/10 file:px-3 file:py-1 file:text-sm file:font-medium file:text-emerald-600"
        />
        <Button type="submit" className="w-full" disabled={isUploading}>
          {isUploading ? "Importando..." : "Importar CSV"}
        </Button>
      </form>

      <Button asChild variant="outline" className="w-full">
        <a href={exportUrl} download>
          Exportar XLSX
        </a>
      </Button>

      <Button asChild variant="ghost" className="w-full justify-start text-left text-sm text-muted-foreground">
        <a href={templateHref} download="athletes-template.csv">
          Descargar plantilla CSV (name, academyId, dob, level, status)
        </a>
      </Button>

      {message && (
        <p className="text-sm text-emerald-600">
          {message}
        </p>
      )}

      {summary && summary.errors.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-md border border-dashed border-amber-300 bg-amber-50/80 p-2 text-xs text-amber-900">
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


