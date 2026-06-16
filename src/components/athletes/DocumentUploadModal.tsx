"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { Upload, X, FileText, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DOCUMENT_TYPES,
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
} from "@/types/athletes";

interface DocumentUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  athleteId: string;
  academyId: string;
  onSuccess?: () => void;
}

interface FormData {
  documentType: DocumentType;
  file: FileList | null;
  issuedDate: string;
  expiryDate: string;
  notes: string;
}

export function DocumentUploadModal({
  open,
  onOpenChange,
  athleteId,
  academyId,
  onSuccess,
}: DocumentUploadModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormData>({
    defaultValues: {
      documentType: "identity_document",
      file: null,
      issuedDate: "",
      expiryDate: "",
      notes: "",
    },
  });

  const watchedDocumentType = watch("documentType");

  const onSubmit = async (data: FormData) => {
    if (!selectedFile) {
      setError("Por favor selecciona un archivo.");
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // In a real implementation, you would upload the file to storage
      // and get back a URL. For now, we'll use a placeholder.
      const fileUrl = `/uploads/${selectedFile.name}`;

      const response = await fetch(
        `/api/athletes/${athleteId}/documents?academyId=${academyId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentType: data.documentType,
            fileName: selectedFile.name,
            fileUrl,
            fileSize: selectedFile.size.toString(),
            mimeType: selectedFile.type,
            issuedDate: data.issuedDate || null,
            expiryDate: data.expiryDate || null,
            notes: data.notes || null,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Error al subir el documento.");
      }

      reset();
      setSelectedFile(null);
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message ?? "Error al subir el documento.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedFile(files[0]);
    }
  };

  const handleClose = (openState: boolean) => {
    if (!openState) {
      reset();
      setSelectedFile(null);
      setError(null);
    }
    onOpenChange(openState);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Subir Documento</DialogTitle>
          <DialogDescription>
            Sube un documento para este atleta. El archivo puede ser PDF, imagen u otro formato común.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Document Type */}
          <div className="space-y-2">
            <Label htmlFor="documentType">
              Tipo de documento <span className="text-red-500">*</span>
            </Label>
            <Select
              value={watchedDocumentType}
              onValueChange={(value) => setValue("documentType", value as DocumentType)}
            >
              <SelectTrigger id="documentType">
                <SelectValue placeholder="Selecciona el tipo" />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {DOCUMENT_TYPE_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.documentType && (
              <p className="text-xs text-red-500">Este campo es requerido.</p>
            )}
          </div>

          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="file">
              Archivo <span className="text-red-500">*</span>
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="file"
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                onChange={handleFileChange}
                className="flex-1"
              />
            </div>
            {selectedFile && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm truncate">{selectedFile.name}</span>
                <span className="text-xs text-muted-foreground">
                  ({(selectedFile.size / 1024).toFixed(1)} KB)
                </span>
              </div>
            )}
            {errors.file && (
              <p className="text-xs text-red-500">Por favor selecciona un archivo.</p>
            )}
          </div>

          {/* Issued Date */}
          <div className="space-y-2">
            <Label htmlFor="issuedDate">Fecha de emisión</Label>
            <Input
              id="issuedDate"
              type="date"
              {...register("issuedDate")}
            />
          </div>

          {/* Expiry Date */}
          <div className="space-y-2">
            <Label htmlFor="expiryDate">Fecha de expiración</Label>
            <Input
              id="expiryDate"
              type="date"
              {...register("expiryDate")}
            />
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notas</Label>
            <Input
              id="notes"
              placeholder="Notas adicionales (opcional)"
              {...register("notes")}
            />
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  Subiendo...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-1" />
                  Subir
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
