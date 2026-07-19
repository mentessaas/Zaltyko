import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";

import { db } from "@/db";
import { events, academies } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { EventsListLazy } from "@/components/events/EventsListLazy";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { resolveAcademySpecialization } from "@/lib/specialization/registry";
import { getAcademySportConfigOptions } from "@/lib/sport-config/service";
import { logger } from "@/lib/logger";

interface PageProps {
  params: Promise<{
    academyId: string;
  }>;
}

export default async function EventsPage({ params }: PageProps) {
  const { academyId } = await params;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  // Obtener academia con tenantId
  const [academy] = await db
    .select({
      id: academies.id,
      tenantId: academies.tenantId,
      country: academies.country,
      academyType: academies.academyType,
      countryCode: academies.countryCode,
      discipline: academies.discipline,
      disciplineVariant: academies.disciplineVariant,
      federationConfigVersion: academies.federationConfigVersion,
      specializationStatus: academies.specializationStatus,
    })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    redirect("/dashboard");
  }

  const specialization = resolveAcademySpecialization(academy);

  // Obtener eventos de la academia filtrando por tenantId
  let eventRows: {
    id: string;
    title: string;
    startDate: string | null;
    endDate: string | null;
    country: string | null;
    province: string | null;
    city: string | null;
    level: string;
    discipline: string | null;
    sportConfigId: string | null;
    isPublic: boolean | null;
    academyId: string;
  }[] = [];
  try {
    eventRows = await db
      .select({
        id: events.id,
        title: events.title,
        startDate: events.startDate,
        endDate: events.endDate,
        country: events.country,
        province: events.province,
        city: events.city,
        level: events.level,
        discipline: events.discipline,
        sportConfigId: events.sportConfigId,
        isPublic: events.isPublic,
        academyId: events.academyId,
      })
      .from(events)
      .where(and(eq(events.academyId, academyId), eq(events.tenantId, academy.tenantId)));
  } catch (error: unknown) {
    logger.error("Error fetching events:", error);
    // Si hay un error, probablemente la tabla no existe o no tiene la estructura correcta
    // Retornar array vacío por ahora
    eventRows = [];
  }
  const sportConfigs = await getAcademySportConfigOptions(academyId);
  const sportConfigNameById = new Map(sportConfigs.map((config) => [config.id, config.branchName]));

  return (
    <div className="space-y-6 py-6 lg:py-8">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: `Eventos de ${specialization.labels.disciplineName}` },
        ]}
      />
      <EventsListLazy
        academyId={academyId}
        events={eventRows.map((event) => ({
          id: event.id,
          title: event.title,
          date: event.startDate ? String(event.startDate) : null,
          location: [event.city, event.province, event.country].filter(Boolean).join(", ") || null,
          status: event.isPublic ? "public" : "private",
          academyId: event.academyId,
          sportConfigName: event.sportConfigId ? sportConfigNameById.get(event.sportConfigId) ?? null : null,
        }))}
        sportConfigs={sportConfigs.map((config) => ({
          id: config.id,
          name: config.name,
          disciplineName: config.disciplineName,
          branchName: config.branchName,
          defaultDisciplineVariant: config.defaultDisciplineVariant,
          competitionTypes: config.competitionTypes.map((item) => ({
            code: item.code,
            name: item.name,
          })),
        }))}
        academyCountry={academy?.country ?? null}
      />
    </div>
  );
}
