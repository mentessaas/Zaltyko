"use client";

import { useState, useRef } from "react";
import { Upload, FileText, X, CheckCircle2, AlertCircle } from "lucide-react";
import { useToast } from "@/components/ui/toast-provider";

interface CsvImportDialogProps {
  open: boolean;
  onClose: () => void;
  onImport: (athletes: Array<{ name: string }>) => Promise<void>;
  academyId: string | null;
}

interface ParsedAthlete {
  name: string;
  row: number;
  errors?: string[];
}

export function CsvImportDialog({ open, onClose, onImport, academyId }: CsvImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [parsedAthletes, setParsedAthletes] = useState<ParsedAthlete[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  if (!open) return null;

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith(".csv")) {
      toast.pushToast({
        title: "Archivo inválido",
        description: "Por favor selecciona un archivo CSV",
        variant: "error",
      });
      return;
    }

    setFile(selectedFile);
    parseCsvFile(selectedFile);
  };

  const parseCsvFile = async (csvFile: File) => {
    try {
      const text = await csvFile.text();
      const lines = text.split("\n").filter((line) => line.trim());
      
      if (lines.length === 0) {
        toast.pushToast({
          title: "Archivo vacío",
          description: "El archivo CSV está vacío",
          variant: "error",
        });
        return;
      }

      const athletes: ParsedAthlete[] = [];
      const errors: string[] = [];

      // Saltar header si existe
      const startIndex = lines[0].toLowerCase().includes("nombre") || lines[0].toLowerCase().includes("name") ? 1 : 0;

      for (let i = startIndex; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Parsear CSV (manejar comillas y comas)
        const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
        const name = values[0]?.trim();

        if (!name || name.length < 2) {
          errors.push(`Fila ${i + 1}: Nombre inválido o vacío`);
          continue;
        }

        athletes.push({
          name,
          row: i + 1,
        });
      }

      if (athletes.length === 0) {
        toast.pushToast({
          title: "Sin datos válidos",
          description: "No se encontraron atletas válidos en el archivo",
          variant: "error",
        });
        return;
      }

      setParsedAthletes(athletes);
      
      if (errors.length > 0) {
        toast.pushToast({
          title: "Advertencia",
          description: `Se encontraron ${errors.length} errores al procesar el archivo. Se importarán ${athletes.length} atletas válidos.`,
          variant: "warning",
        });
      }
    } catch (error) {
      toast.pushToast({
        title: "Error al procesar archivo",
        description: "No se pudo leer el archivo CSV",
        variant: "error",
      });
    }
  };

  const handleImport = async () => {
    if (parsedAthletes.length === 0) return;

    setIsImporting(true);
    try {
      await onImport(parsedAthletes.map((a) => ({ name: a.name })));
      toast.pushToast({
        title: "Importación exitosa",
        description: `Se importaron ${parsedAthletes.length} atletas correctamente`,
        variant: "success",
      });
      handleClose();
    } catch (error) {
      toast.pushToast({
        title: "Error al importar",
        description: "No se pudieron importar todos los atletas",
        variant: "error",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setParsedAthletes([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 backdrop-blur-sm px-4 py-10"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-2xl rounded-lg border border-border bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Upload className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Importar atletas desde CSV</h2>
              <p className="text-sm text-muted-foreground">
                Sube un archivo CSV con los nombres de los atletas
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {!file ? (
            <div className="space-y-4">
              <div className="rounded-lg border-2 border-dashed border-border p-8 text-center">
                <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-sm font-medium mb-2">Selecciona un archivo CSV</p>
                <p className="text-xs text-muted-foreground mb-4">
                  El archivo debe tener una columna \"Nombre\" o \"Name\" en la primera fila
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="csv-upload"
                />
                <label
                  htmlFor="csv-upload"
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white cursor-pointer hover:bg-primary/90 transition-colors"
                >
                  <Upload className="h-4 w-4" />
                  Seleccionar archivo
                </label>
              </div>

              <div className="rounded-md bg-muted/50 p-4 text-xs space-y-2">
                <p className="font-semibold">Formato esperado:</p>
                <pre className="bg-background p-2 rounded border border-border overflow-x-auto">
                  {`Nombre
Juan Pérez
María García
Pedro López`}
                </pre>
                <p className="text-muted-foreground">
                  O simplemente una lista de nombres, uno por línea
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted/50 p-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-medium">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {parsedAthletes.length} atleta{parsedAthletes.length !== 1 ? "s" : ""} encontrado{parsedAthletes.length !== 1 ? "s" : ""}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setFile(null);
                    setParsedAthletes([]);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="rounded-sm p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {parsedAthletes.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">Vista previa ({parsedAthletes.length} atletas):</p>
                  <div className="max-h-60 overflow-auto rounded-md border border-border">
                    <div className="divide-y divide-border">
                      {parsedAthletes.slice(0, 20).map((athlete, idx) => (
                        <div key={idx} className="flex items-center gap-2 px-3 py-2 text-sm">
                          <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                          <span>{athlete.name}</span>
                        </div>
                      ))}
                      {parsedAthletes.length > 20 && (
                        <div className="px-3 py-2 text-xs text-muted-foreground text-center">
                          ... y {parsedAthletes.length - 20} más
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 border-t border-border px-6 py-4">
          <button
            onClick={handleClose}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Cancelar
          </button>
          {parsedAthletes.length > 0 && (
            <button
              onClick={handleImport}
              disabled={isImporting}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isImporting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Importando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  Importar {parsedAthletes.length} atleta{parsedAthletes.length !== 1 ? "s" : ""}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

