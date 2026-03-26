"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Briefcase, Clock, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface Application {
  id: string;
  status: string;
  message: string | null;
  resumeUrl: string | null;
  createdAt: string;
  listingId: string;
  listingTitle: string;
  listingCategory: string;
  listingJobType: string;
  listingStatus: string | null;
  academyName: string | null;
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "Pendiente", color: "bg-yellow-100 text-yellow-800" },
  reviewed: { label: "En revisión", color: "bg-blue-100 text-blue-800" },
  interview: { label: "Entrevista", color: "bg-purple-100 text-purple-800" },
  accepted: { label: "Aceptado", color: "bg-green-100 text-green-800" },
  rejected: { label: "Rechazado", color: "bg-red-100 text-red-800" },
};

const CATEGORY_LABELS: Record<string, string> = {
  coach: "Entrenador/a",
  assistant_coach: "Entrenador/a asistente",
  administrative: "Administrativo/a",
  physiotherapist: "Fisioterapeuta",
  psychologist: "Psicólogo/a",
  other: "Otro",
};

const JOB_TYPE_LABELS: Record<string, string> = {
  full_time: "Tiempo completo",
  part_time: "Media jornada",
  internship: "Prácticas",
};

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function MisPostulacionesPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchApplications();
  }, []);

  async function fetchApplications() {
    setLoading(true);
    try {
      const res = await fetch("/api/empleo/mis-postulaciones");
      if (res.ok) {
        const data = await res.json();
        setApplications(data.applications ?? []);
      }
    } catch {
      setApplications([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mis postulaciones</h1>
          <p className="text-muted-foreground text-sm">
            Seguimiento de tus solicitudes de empleo.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/empleo">
            <Briefcase className="h-4 w-4 mr-1" />
            Ver ofertas
          </Link>
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 rounded-full border-2 border-red-500 border-t-transparent animate-spin" />
        </div>
      ) : applications.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <p className="text-muted-foreground">Aún no has aplicado a ninguna oferta.</p>
            <Button asChild>
              <Link href="/empleo">Explorar ofertas de empleo</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => {
            const statusInfo = STATUS_LABELS[app.status] ?? {
              label: app.status,
              color: "bg-gray-100 text-gray-800",
            };
            return (
              <Card key={app.id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base">{app.listingTitle}</CardTitle>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground">
                        <span className="font-medium">
                          {CATEGORY_LABELS[app.listingCategory] ?? app.listingCategory}
                        </span>
                        <span>·</span>
                        <span>
                          {JOB_TYPE_LABELS[app.listingJobType] ?? app.listingJobType}
                        </span>
                        {app.academyName && (
                          <>
                            <span>·</span>
                            <span>{app.academyName}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <Badge className={`${statusInfo.color} shrink-0 capitalize`}>
                      {statusInfo.label}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>Publicado el {formatDate(app.createdAt)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {app.resumeUrl && (
                        <Button asChild variant="ghost" size="sm">
                          <a href={app.resumeUrl} target="_blank" rel="noopener noreferrer">
                            Ver CV
                          </a>
                        </Button>
                      )}
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/empleo/${app.listingId}`}>
                          Ver oferta
                        </Link>
                      </Button>
                    </div>
                  </div>

                  {app.message && (
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-2">
                      {app.message}
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
