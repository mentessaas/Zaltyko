"use client";

import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  FileText,
  Download,
  Trash2,
  CheckCircle2,
  Clock,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DOCUMENT_TYPE_LABELS,
  type AthleteDocumentWithUrl,
  type DocumentType,
} from "@/types/athletes";

interface AthleteDocumentsListProps {
  documents: AthleteDocumentWithUrl[];
  athleteId: string;
  onDelete?: (documentId: string) => void;
  compact?: boolean;
}

export function AthleteDocumentsList({
  documents,
  athleteId,
  onDelete,
  compact = false,
}: AthleteDocumentsListProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [documentToDelete, setDocumentToDelete] = useState<string | null>(null);

  const formatDate = (date: Date | string | null) => {
    if (!date) return "Sin fecha";
    try {
      return format(new Date(date), "d MMM yyyy", { locale: es });
    } catch {
      return String(date);
    }
  };

  const getStatusBadge = (doc: AthleteDocumentWithUrl) => {
    if (doc.isVerified) {
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Verificado
        </Badge>
      );
    }

    if (doc.expiryDate) {
      const expiry = new Date(doc.expiryDate);
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

      if (expiry < new Date()) {
        return (
          <Badge className="bg-red-100 text-red-800 border-red-200">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Expirado
          </Badge>
        );
      }

      if (expiry <= thirtyDaysFromNow) {
        return (
          <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
            <Clock className="h-3 w-3 mr-1" />
            Por expirar
          </Badge>
        );
      }
    }

    return (
      <Badge variant="outline" className="bg-gray-50 text-gray-600">
        <Clock className="h-3 w-3 mr-1" />
        Pendiente
      </Badge>
    );
  };

  const handleDeleteClick = (documentId: string) => {
    setDocumentToDelete(documentId);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = () => {
    if (documentToDelete && onDelete) {
      onDelete(documentToDelete);
    }
    setDeleteDialogOpen(false);
    setDocumentToDelete(null);
  };

  const handleDownload = (doc: AthleteDocumentWithUrl) => {
    // In a real implementation, this would open the file URL
    window.open(doc.fileUrl, "_blank");
  };

  if (documents.length === 0) {
    return (
      <div className="text-center py-8">
        <FileText className="h-12 w-12 mx-auto text-muted-foreground/50" />
        <p className="mt-2 text-sm text-muted-foreground">
          No hay documentos cargados
        </p>
      </div>
    );
  }

  return (
    <>
      <div className={`space-y-2 ${compact ? "" : "divide-y divide-border"}`}>
        {documents.map((doc) => (
          <div
            key={doc.id}
            className={`flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 transition-colors ${
              compact ? "" : "py-4 first:pt-0 last:pb-0"
            }`}
          >
            {/* Icon */}
            <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-sm truncate">
                  {DOCUMENT_TYPE_LABELS[doc.documentType as DocumentType] ??
                    doc.documentType}
                </p>
                {getStatusBadge(doc)}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span>{doc.fileName}</span>
                {doc.issuedDate && (
                  <span>Emitido: {formatDate(doc.issuedDate)}</span>
                )}
                {doc.expiryDate && (
                  <span>Expira: {formatDate(doc.expiryDate)}</span>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => handleDownload(doc)}
              >
                <Download className="h-4 w-4" />
              </Button>
              {onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                  onClick={() => handleDeleteClick(doc.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar documento</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar este documento? Esta acción
              no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-red-600 hover:bg-red-700"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
