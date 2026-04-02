"use client";

import * as React from "react";
import { useDropzone, type FileRejection } from "react-dropzone";
import { Upload, X, FileIcon, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

export interface UploadedFile {
  id: string;
  file: File;
  progress: number;
  status: "pending" | "uploading" | "completed" | "error";
  error?: string;
  url?: string;
}

interface FileUploadProps {
  value?: UploadedFile[];
  onChange?: (files: UploadedFile[]) => void;
  accept?: Record<string, string[]>;
  maxSize?: number;
  maxFiles?: number;
  disabled?: boolean;
  className?: string;
  uploadFn?: (file: File, onProgress: (progress: number) => void) => Promise<string>;
  onFileAdded?: (file: File) => void;
  onFileRemoved?: (fileId: string) => void;
}

interface FileUploadDropzoneProps extends Omit<FileUploadProps, "className"> {
  dropzoneClassName?: string;
  children?: React.ReactNode;
}

const generateId = () => Math.random().toString(36).substring(2, 15);

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

const FileUpload = React.forwardRef<HTMLDivElement, FileUploadProps>(
  ({
    value = [],
    onChange,
    accept,
    maxSize = 10 * 1024 * 1024, // 10MB default
    maxFiles = 10,
    disabled,
    className,
    uploadFn,
    onFileAdded,
    onFileRemoved,
  }, ref) => {
    const updateFile = (id: string, updates: Partial<UploadedFile>) => {
      const newFiles = value.map((f) => (f.id === id ? { ...f, ...updates } : f));
      onChange?.(newFiles);
    };

    const removeFile = (id: string) => {
      const file = value.find((f) => f.id === id);
      if (file) {
        onChange?.(value.filter((f) => f.id !== id));
        onFileRemoved?.(id);
      }
    };

    const handleDrop = React.useCallback(
      async (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
        const newFiles: UploadedFile[] = acceptedFiles.slice(0, maxFiles - value.length).map((file) => ({
          id: generateId(),
          file,
          progress: 0,
          status: "pending",
        }));

        if (newFiles.length > 0) {
          onChange?.([...value, ...newFiles]);
          newFiles.forEach((uploadedFile) => {
            onFileAdded?.(uploadedFile.file);
          });
        }

        rejectedFiles.forEach(({ file, errors }) => {
          const errorMessage = errors.map((e) => {
            if (e.code === "file-too-large") return `El archivo excede el tamanho máximo de ${formatFileSize(maxSize)}`;
            if (e.code === "file-too-small") return "El archivo es demasiado pequeño";
            if (e.code === "accept") return "Tipo de archivo no aceptado";
            if (e.code === "too-many-files") return `Máximo ${maxFiles} archivos permitidos`;
            return e.message;
          }).join(", ");

          const rejectedFile: UploadedFile = {
            id: generateId(),
            file,
            progress: 0,
            status: "error",
            error: errorMessage,
          };
          onChange?.([...value, rejectedFile]);
        });

        // Upload files if uploadFn is provided
        if (uploadFn) {
          for (const uploadedFile of newFiles) {
            updateFile(uploadedFile.id, { status: "uploading" });
            try {
              const url = await uploadFn(uploadedFile.file, (progress) => {
                updateFile(uploadedFile.id, { progress });
              });
              updateFile(uploadedFile.id, { status: "completed", progress: 100, url });
            } catch (error) {
              updateFile(uploadedFile.id, {
                status: "error",
                error: error instanceof Error ? error.message : "Error al subir archivo",
              });
            }
          }
        }
      },
      [value, maxFiles, maxSize, onChange, uploadFn, onFileAdded, onFileRemoved]
    );

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
      onDrop: handleDrop,
      accept,
      maxSize,
      maxFiles: maxFiles - value.length,
      disabled: disabled || value.length >= maxFiles,
    });

    return (
      <div ref={ref} className={cn("space-y-4", className)}>
        <div
          {...getRootProps()}
          className={cn(
            "border-2 border-dashed rounded-xl p-6 transition-colors cursor-pointer",
            isDragActive && "border-primary bg-primary/5",
            !isDragActive && "border-border hover:border-primary/50",
            (disabled || value.length >= maxFiles) && "opacity-50 cursor-not-allowed"
          )}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label="Subir archivos"
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              const input = document.createElement("input");
              input.type = "file";
              input.multiple = maxFiles > 1;
              input.accept = accept ? Object.values(accept).flat().join(",") : "";
              input.onchange = (ev) => {
                const files = Array.from((ev.target as HTMLInputElement).files || []);
                handleDrop(files, []);
              };
              input.click();
            }
          }}
        >
          <input {...getInputProps()} aria-hidden="true" />
          <div className="flex flex-col items-center justify-center gap-2 text-center">
            <Upload className={cn("h-10 w-10", isDragActive ? "text-primary" : "text-muted-foreground")} />
            <div className="text-sm">
              {isDragActive ? (
                <span className="text-primary font-medium">Suelta los archivos aquí</span>
              ) : (
                <>
                  <span className="text-foreground font-medium">Arrastra archivos aquí</span>
                  {" "}
                  <span className="text-muted-foreground">o haz clic para seleccionar</span>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {accept
                ? `Formatos: ${Object.values(accept).flat().join(", ").replace(/\./g, "").toUpperCase()}`
                : "Todos los formatos aceptados"}
              {" "}
              • Máximo {formatFileSize(maxSize)} por archivo
              {maxFiles > 1 && ` • Máximo ${maxFiles} archivos`}
            </p>
          </div>
        </div>

        {value.length > 0 && (
          <ul className="space-y-2" role="list" aria-label="Archivos seleccionados">
            {value.map((uploadedFile) => (
              <li
                key={uploadedFile.id}
                className="flex items-center gap-3 p-3 rounded-lg border bg-background"
              >
                <div className="flex-shrink-0">
                  {uploadedFile.status === "uploading" && (
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  )}
                  {uploadedFile.status === "completed" && (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  )}
                  {uploadedFile.status === "error" && (
                    <AlertCircle className="h-5 w-5 text-red-500" />
                  )}
                  {uploadedFile.status === "pending" && (
                    <FileIcon className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate" title={uploadedFile.file.name}>
                      {uploadedFile.file.name}
                    </p>
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {formatFileSize(uploadedFile.file.size)}
                    </span>
                  </div>
                  {uploadedFile.status === "uploading" && (
                    <Progress value={uploadedFile.progress} className="mt-2 h-1" />
                  )}
                  {uploadedFile.status === "error" && uploadedFile.error && (
                    <p className="text-xs text-red-500 mt-1" role="alert">
                      {uploadedFile.error}
                    </p>
                  )}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 flex-shrink-0"
                  onClick={() => removeFile(uploadedFile.id)}
                  aria-label={`Eliminar ${uploadedFile.file.name}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }
);
FileUpload.displayName = "FileUpload";

const FileUploadDropzone = React.forwardRef<HTMLDivElement, FileUploadDropzoneProps>(
  (
    {
      value,
      onChange,
      accept,
      maxSize,
      maxFiles,
      disabled,
      dropzoneClassName,
      children,
      uploadFn,
      onFileAdded,
      onFileRemoved,
    },
    ref
  ) => {
    return (
      <div ref={ref} className={cn("relative", dropzoneClassName)}>
        <FileUpload
          value={value}
          onChange={onChange}
          accept={accept}
          maxSize={maxSize}
          maxFiles={maxFiles}
          disabled={disabled}
          uploadFn={uploadFn}
          onFileAdded={onFileAdded}
          onFileRemoved={onFileRemoved}
        />
        {children && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {children}
          </div>
        )}
      </div>
    );
  }
);
FileUploadDropzone.displayName = "FileUploadDropzone";

export { FileUpload, FileUploadDropzone };
export type { FileUploadProps, FileUploadDropzoneProps };
