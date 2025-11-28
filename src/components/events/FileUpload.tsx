"use client";

import { useState, useRef } from "react";
import { Upload, X, FileText, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FileUploadProps {
  type: "image" | "file";
  label: string;
  accept?: string;
  maxSizeMB?: number;
  files: string[];
  onFilesChange: (files: string[]) => void;
  eventId?: string;
  disabled?: boolean;
}

export function FileUpload({
  type,
  label,
  accept,
  maxSizeMB = 10,
  files,
  onFilesChange,
  eventId,
  disabled = false,
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (!selectedFiles || selectedFiles.length === 0) return;

    setError(null);
    setUploading(true);

    try {
      const newFiles: string[] = [];

      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];

        // Validar tamaño
        if (file.size > maxSizeMB * 1024 * 1024) {
          throw new Error(`El archivo ${file.name} excede el tamaño máximo de ${maxSizeMB}MB`);
        }

        // Subir archivo
        const response = await fetch("/api/events/upload", {
          method: "POST",
          headers: {
            "x-academy-id": eventId || "",
          },
          credentials: "include",
          body: (() => {
            const formData = new FormData();
            formData.append("file", file);
            formData.append("type", type);
            if (eventId) formData.append("eventId", eventId);
            return formData;
          })(),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.message || "Error al subir archivo");
        }

        const { url } = await response.json();
        newFiles.push(url);
      }

      onFilesChange([...files, ...newFiles]);
    } catch (err: any) {
      setError(err.message || "Error al subir archivo");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemove = (index: number) => {
    const newFiles = files.filter((_, i) => i !== index);
    onFilesChange(newFiles);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-foreground">{label}</label>
      
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || uploading}
            className="flex items-center gap-2"
          >
            {type === "image" ? <ImageIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
            {uploading ? "Subiendo..." : `Subir ${type === "image" ? "imagen" : "archivo"}`}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept={accept || (type === "image" ? "image/*" : ".pdf,.doc,.docx")}
            multiple
            onChange={handleFileSelect}
            className="hidden"
            disabled={disabled || uploading}
          />
          <span className="text-xs text-muted-foreground">
            Máx. {maxSizeMB}MB
          </span>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {files.length > 0 && (
          <div className="space-y-2">
            {files.map((url, index) => (
              <div
                key={index}
                className="flex items-center justify-between rounded-lg border border-border bg-card p-2"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  {type === "image" ? (
                    <img
                      src={url}
                      alt={`Imagen ${index + 1}`}
                      className="h-10 w-10 rounded object-cover"
                    />
                  ) : (
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                  )}
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-zaltyko-primary hover:underline truncate"
                  >
                    {url.split("/").pop() || `Archivo ${index + 1}`}
                  </a>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(index)}
                  disabled={disabled}
                  className="shrink-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

