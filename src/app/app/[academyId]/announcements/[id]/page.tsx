import Link from "next/link";
import { cookies } from "next/headers";
import { redirect, notFound } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { ArrowLeft, Calendar, Users, Eye } from "lucide-react";

import { db } from "@/db";
import { announcements as announcementsTable } from "@/db/schema/announcements";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";

const PRIORITY_LABELS: Record<string, { label: string; class: string }> = {
  low: { label: "Baja", class: "bg-gray-100 text-gray-800" },
  normal: { label: "Normal", class: "bg-blue-100 text-blue-800" },
  high: { label: "Alta", class: "bg-amber-100 text-amber-800" },
  urgent: { label: "Urgente", class: "bg-red-100 text-red-800" },
};

const CATEGORY_LABELS: Record<string, string> = {
  general: "General",
  event: "Evento",
  billing: "Facturación",
  class: "Clase",
  news: "Noticias",
};

const STATUS_LABELS: Record<string, { label: string; class: string }> = {
  draft: { label: "Borrador", class: "bg-gray-100 text-gray-800" },
  published: { label: "Publicado", class: "bg-green-100 text-green-800" },
  archived: { label: "Archivado", class: "bg-yellow-100 text-yellow-800" },
};

function formatDate(dateStr: Date | string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface PageProps {
  params: Promise<{ academyId: string; id: string }>;
}

export default async function AnnouncementDetailPage({ params }: PageProps) {
  const { academyId, id } = await params;

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Obtener el anuncio
  const [announcement] = await db
    .select({
      id: announcementsTable.id,
      academyId: announcementsTable.academyId,
      title: announcementsTable.title,
      content: announcementsTable.content,
      actionUrl: announcementsTable.actionUrl,
      actionLabel: announcementsTable.actionLabel,
      priority: announcementsTable.priority,
      category: announcementsTable.category,
      status: announcementsTable.status,
      publishedAt: announcementsTable.publishedAt,
      createdAt: announcementsTable.createdAt,
      sentCount: announcementsTable.sentCount,
      readCount: announcementsTable.readCount,
    })
    .from(announcementsTable)
    .where(
      and(
        eq(announcementsTable.id, id),
        eq(announcementsTable.academyId, academyId)
      )
    )
    .limit(1);

  if (!announcement) {
    notFound();
  }

  const priorityInfo = PRIORITY_LABELS[announcement.priority] || PRIORITY_LABELS.normal;
  const statusInfo = STATUS_LABELS[announcement.status] || STATUS_LABELS.draft;
  const sentCount = parseInt(announcement.sentCount || "0");
  const readCount = parseInt(announcement.readCount || "0");
  const readRate = sentCount > 0 ? Math.round((readCount / sentCount) * 100) : 0;

  return (
    <div className="space-y-6">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Anuncios", href: `/app/${academyId}/announcements` },
          { label: announcement.title },
        ]}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* Content Card */}
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-2xl">{announcement.title}</CardTitle>
                  <CardDescription className="mt-2 flex items-center gap-2">
                    <Badge className={priorityInfo.class}>{priorityInfo.label}</Badge>
                    <Badge className={statusInfo.class}>{statusInfo.label}</Badge>
                    <span>•</span>
                    <span>{CATEGORY_LABELS[announcement.category] || announcement.category}</span>
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="prose prose-sm max-w-none">
                <p className="whitespace-pre-wrap text-base">{announcement.content}</p>
              </div>

              {(announcement.actionUrl || announcement.actionLabel) && (
                <div className="pt-4 border-t">
                  {announcement.actionLabel && announcement.actionUrl ? (
                    <Button asChild>
                      <a href={announcement.actionUrl} target="_blank" rel="noopener noreferrer">
                        {announcement.actionLabel}
                      </a>
                    </Button>
                  ) : announcement.actionLabel ? (
                    <span className="text-sm text-muted-foreground">
                      Botón: {announcement.actionLabel}
                    </span>
                  ) : null}
                  {announcement.actionUrl && !announcement.actionLabel && (
                    <span className="text-sm text-muted-foreground">
                      URL: {announcement.actionUrl}
                    </span>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          {/* Stats Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Estadísticas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Enviados</p>
                  <p className="text-xl font-semibold">{sentCount}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Eye className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Leídos</p>
                  <p className="text-xl font-semibold">
                    {readCount} <span className="text-sm font-normal text-muted-foreground">({readRate}%)</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Publicado</p>
                  <p className="text-sm font-medium">{formatDate(announcement.publishedAt)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Actions Card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Acciones</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full" asChild>
                <Link href={`/app/${academyId}/announcements`}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Volver a anuncios
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}