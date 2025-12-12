import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  academies,
  classCoachAssignments,
  classes,
  coaches,
  profiles,
} from "@/db/schema";
import CoachAssignmentsPanel from "@/components/coaches/CoachAssignmentsPanel";
import { createClient } from "@/lib/supabase/server";

interface CoachesPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function CoachesPage({ searchParams }: CoachesPageProps) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) {
    redirect("/dashboard");
  }

  const tenantOverride =
    typeof searchParams.tenant === "string" && searchParams.tenant.trim().length > 0
      ? searchParams.tenant.trim()
      : undefined;

  const tenantId = profile.tenantId ?? tenantOverride;

  if (!tenantId) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-8 text-center">
        <h1 className="text-2xl font-semibold">Selecciona un tenant</h1>
        <p className="text-muted-foreground">
          Eres Súper Admin sin tenant asignado. Añade `?tenant=&lt;tenant_id&gt;` en la URL para
          revisar los entrenadores de un tenant específico.
        </p>
      </div>
    );
  }

  const coachRows = await db
    .select({
      id: coaches.id,
      name: coaches.name,
      email: coaches.email,
      phone: coaches.phone,
      academyId: coaches.academyId,
      academyName: academies.name,
      createdAt: coaches.createdAt,
    })
    .from(coaches)
    .innerJoin(academies, eq(coaches.academyId, academies.id))
    .where(eq(coaches.tenantId, tenantId))
    .orderBy(asc(coaches.name));

  const assignments = await db
    .select({
      coachId: classCoachAssignments.coachId,
      classId: classes.id,
      className: classes.name,
      academyId: classes.academyId,
    })
    .from(classCoachAssignments)
    .innerJoin(classes, eq(classCoachAssignments.classId, classes.id))
    .where(eq(classCoachAssignments.tenantId, tenantId));

  const classRows = await db
    .select({
      id: classes.id,
      name: classes.name,
      academyId: classes.academyId,
      academyName: academies.name,
    })
    .from(classes)
    .innerJoin(academies, eq(classes.academyId, academies.id))
    .where(eq(classes.tenantId, tenantId))
    .orderBy(asc(academies.name), asc(classes.name));

  const classGroups = classRows.reduce<
    Array<{ academyId: string; academyName: string | null; classes: Array<{ id: string; name: string | null }> }>
  >((acc, row) => {
    let group = acc.find((item) => item.academyId === row.academyId);
    if (!group) {
      group = {
        academyId: row.academyId,
        academyName: row.academyName,
        classes: [],
      };
      acc.push(group);
    }
    group.classes.push({ id: row.id, name: row.name });
    return acc;
  }, []);

  const formattedCoaches = coachRows.map((coach) => ({
    ...coach,
    classes: assignments
      .filter((assignment) => assignment.coachId === coach.id)
      .map((assignment) => ({
        id: assignment.classId,
        name: classRows.find((row) => row.id === assignment.classId)?.name ?? assignment.className,
        academyId: assignment.academyId,
      })),
  }));

  return (
    <div className="space-y-8 p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Entrenadores</h1>
        <p className="text-muted-foreground">
          Asigna entrenadores a clases y academias, sincroniza el calendario y controla quién puede
          registrar asistencia.
        </p>
      </header>

      <CoachAssignmentsPanel
        tenantId={tenantId}
        coaches={formattedCoaches}
        classGroups={classGroups}
      />
    </div>
  );
}


