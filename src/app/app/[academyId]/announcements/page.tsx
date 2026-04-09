import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, and, desc, inArray } from "drizzle-orm";
import { Megaphone, Plus } from "lucide-react";

import { db } from "@/db";
import { announcements as announcementsTable } from "@/db/schema/announcements";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/shared/EmptyState";
import { AnnouncementForm } from "@/components/announcements/AnnouncementForm";

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

function formatDate(dateStr: Date | string | null): string {
  if (!dateStr) return "—";
  const date = new Date(dateStr);
  return date.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface PageProps {
  params: {
    academyId: string;
  };
}

export default async function AnnouncementsPage({ params }: PageProps) {
  const { academyId } = params;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Obtener anuncios de la academia
  const announcementRows = await db
    .select({
      id: announcementsTable.id,
      academyId: announcementsTable.academyId,
      title: announcementsTable.title,
      content: announcementsTable.content,
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
        eq(announcementsTable.academyId, academyId),
        eq(announcementsTable.status, "published")
      )
    )
    .orderBy(desc(announcementsTable.publishedAt))
    .limit(50);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Anuncios</h1>
          <p className="text-muted-foreground mt-1">
            Gestiona los anuncios de tu academia
          </p>
        </div>
        <Button asChild>
          <a href={`/app/${academyId}/announcements/new`}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo anuncio
          </a>
        </Button>
      </div>

      {announcementRows.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-8 w-8" />}
          title="No hay anuncios"
          description="Aún no has creado ningún anuncio. Crea tu primer anuncio para informar a los miembros de tu academia."
          action={{ label: "Crear anuncio", href: `/app/${academyId}/announcements/new` }}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {announcementRows.map((announcement) => {
            const priorityInfo = PRIORITY_LABELS[announcement.priority] || PRIORITY_LABELS.normal;
            const sentCount = parseInt(announcement.sentCount || "0");
            const readCount = parseInt(announcement.readCount || "0");
            const readRate = sentCount > 0 ? Math.round((readCount / sentCount) * 100) : 0;

            return (
              <Card
                key={announcement.id}
                className="hover:shadow-lg transition-shadow border border-zaltyko-neutral/20"
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-lg leading-tight">
                      {announcement.title}
                    </CardTitle>
                    <Badge className={priorityInfo.class}>{priorityInfo.label}</Badge>
                  </div>
                  <CardDescription className="flex items-center gap-2 mt-1">
                    <span>{CATEGORY_LABELS[announcement.category] || announcement.category}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {announcement.content}
                  </p>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>
                      Enviado: {formatDate(announcement.publishedAt)}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-muted-foreground">
                      Enviados: <span className="font-medium">{sentCount}</span>
                    </span>
                    <span className="text-muted-foreground">
                      Leídos: <span className="font-medium">{readCount}</span> ({readRate}%)
                    </span>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button variant="outline" size="sm" className="flex-1" asChild>
                      <a href={`/app/${academyId}/announcements/${announcement.id}`}>
                        Ver detalles
                      </a>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}