"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  FileText,
  Upload,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DocumentUploadModal } from "./DocumentUploadModal";
import { AthleteDocumentsList } from "./AthleteDocumentsList";
import type { AthleteDocumentWithUrl, DocumentType } from "@/types/athletes";

interface AthleteDocumentsSectionProps {
  athleteId: string;
  academyId: string;
}

export function AthleteDocumentsSection({
  athleteId,
  academyId,
}: AthleteDocumentsSectionProps) {
  const [documents, setDocuments] = useState<AthleteDocumentWithUrl[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `/api/athletes/${athleteId}/documents?academyId=${academyId}`
      );
      if (!response.ok) {
        throw new Error("No se pudieron cargar los documentos.");
      }

      const data = await response.json();
      setDocuments(data.data || []);
    } catch (err) {
      setError((err as Error).message ?? "Error al cargar los documentos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [athleteId, academyId]);

  const handleUploadSuccess = () => {
    setUploadModalOpen(false);
    fetchDocuments();
  };

  const handleDeleteDocument = async (documentId: string) => {
    try {
      const response = await fetch(
        `/api/athletes/${athleteId}/documents?documentId=${documentId}`,
        { method: "DELETE" }
      );

      if (!response.ok) {
        throw new Error("No se pudo eliminar el documento.");
      }

      setDocuments((prev) => prev.filter((d) => d.id !== documentId));
    } catch (err) {
      setError((err as Error).message ?? "Error al eliminar el documento.");
    }
  };

  // Count documents by status
  const verifiedCount = documents.filter((d) => d.isVerified).length;
  const pendingCount = documents.filter((d) => !d.isVerified).length;
  const expiringCount = documents.filter((d) => {
    if (!d.expiryDate) return false;
    const expiry = new Date(d.expiryDate);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    return expiry <= thirtyDaysFromNow && expiry > new Date();
  }).length;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Documentos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 bg-muted animate-pulse rounded-lg"
              />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Documentos
            </CardTitle>
            <div className="flex gap-2 mt-2">
              {verifiedCount > 0 && (
                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  {verifiedCount} verificados
                </Badge>
              )}
              {pendingCount > 0 && (
                <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                  <Clock className="h-3 w-3 mr-1" />
                  {pendingCount} pendientes
                </Badge>
              )}
              {expiringCount > 0 && (
                <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  {expiringCount} por expirar
                </Badge>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              asChild
            >
              <Link href={`/app/${academyId}/athletes/${athleteId}/documents`}>
                Ver todos
                <ChevronRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="sm" onClick={() => setUploadModalOpen(true)}>
              <Upload className="h-4 w-4 mr-1" />
              Subir
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          {documents.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/50" />
              <p className="mt-2 text-sm text-muted-foreground">
                No hay documentos cargados
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setUploadModalOpen(true)}
              >
                <Upload className="h-4 w-4 mr-1" />
                Subir primer documento
              </Button>
            </div>
          ) : (
            <AthleteDocumentsList
              documents={documents.slice(0, 5)}
              athleteId={athleteId}
              onDelete={handleDeleteDocument}
              compact
            />
          )}
        </CardContent>
      </Card>

      <DocumentUploadModal
        open={uploadModalOpen}
        onOpenChange={setUploadModalOpen}
        athleteId={athleteId}
        academyId={academyId}
        onSuccess={handleUploadSuccess}
      />
    </>
  );
}
