import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, and, desc, inArray } from "drizzle-orm";
import { Megaphone, Plus } from "lucide-react";

import { db } from "@/db";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { academies, memberships, announcements as announcementsTable } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/shared/EmptyState";

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

export default async function AnnouncementsPage() {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  let currentProfile;
  try {
    currentProfile = await getCurrentProfile(user.id);
  } catch (error) {
    console.error("Error getting profile:", error);
    redirect("/onboarding");
  }

  if (!currentProfile) {
    redirect("/dashboard");
  }

  // Obtener academias del usuario donde es owner
  const userAcademies = await db
    .select({
      id: academies.id,
      name: academies.name,
      tenantId: academies.tenantId,
    })
    .from(memberships)
    .innerJoin(academies, eq(memberships.academyId, academies.id))
    .where(
      and(
        eq(memberships.userId, currentProfile.userId),
        eq(memberships.role, "owner")
      )
    );

  const effectiveTenantId = currentProfile.tenantId ?? userAcademies[0]?.tenantId;

  if (!effectiveTenantId) {
    return (
      <div className="space-y-6">
        <PageHeader
          breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Anuncios" }]}
          title="Anuncios"
          description="Gestiona los anuncios de tus academias"
          icon={<Megaphone className="h-5 w-5" strokeWidth={1.5} />}
        />
        <EmptyState
          icon={<Megaphone className="h-8 w-8" />}
          title="No tienes academias"
          description="Necesitas tener al menos una academia para crear anuncios."
        />
      </div>
    );
  }

  // Obtener anuncios de todas las academias donde el usuario es owner/admin
  const academyIds = userAcademies.map((a) => a.id);

  let announcementRows: Array<{
    id: string;
    academyId: string;
    title: string;
    content: string;
    priority: string;
    category: string;
    status: string;
    publishedAt: Date | null;
    createdAt: Date;
    sentCount: string;
    readCount: string;
    academyName: string;
  }> = [];

  if (academyIds.length > 0) {
    const results = await db
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
        academyName: academies.name,
      })
      .from(announcementsTable)
      .innerJoin(academies, eq(announcementsTable.academyId, academies.id))
      .where(
        and(
          inArray(announcementsTable.academyId, academyIds),
          eq(announcementsTable.status, "published")
        )
      )
      .orderBy(desc(announcementsTable.publishedAt))
      .limit(50);

    announcementRows = results;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Anuncios" }]}
        title="Anuncios"
        description="Gestiona los anuncios de tus academias"
        icon={<Megaphone className="h-5 w-5" strokeWidth={1.5} />}
        actions={
          userAcademies.length > 0 && (
            <Button asChild>
              <Link href="/dashboard/announcements/new">
                <Plus className="h-4 w-4 mr-2" />
                Nuevo anuncio
              </Link>
            </Button>
          )
        }
      />

      {announcementRows.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-8 w-8" />}
          title="No hay anuncios"
          description="Aún no has creado ningún anuncio. Crea tu primer anuncio para informar a los miembros de tus academias."
          action={
            userAcademies.length > 0
              ? { label: "Crear anuncio", href: "/dashboard/announcements/new" }
              : undefined
          }
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
                    <span className="font-medium">{announcement.academyName}</span>
                    <span>•</span>
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
                      <Link href={`/dashboard/announcements/${announcement.id}`}>
                        Ver detalles
                      </Link>
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