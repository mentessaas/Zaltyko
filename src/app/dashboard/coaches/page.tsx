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

  // Stats
  const uniqueAcademies = new Set(coachRows.map(c => c.academyId)).size;
  const totalAssignments = assignments.length;

  return (
    <div className="space-y-8 p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold">Entrenadores</h1>
        <p className="text-muted-foreground">
          Asigna entrenadores a clases y academias, sincroniza el calendario y controla quién puede
          registrar asistencia.
        </p>
      </header>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-violet-50 to-violet-100 rounded-xl p-4 border border-violet-200">
          <p className="text-sm font-medium text-violet-700">Total Entrenadores</p>
          <p className="text-3xl font-bold text-violet-800">{coachRows.length}</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4 border border-emerald-200">
          <p className="text-sm font-medium text-emerald-700">Clases Asignadas</p>
          <p className="text-3xl font-bold text-emerald-800">{totalAssignments}</p>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
          <p className="text-sm font-medium text-blue-700">Academias</p>
          <p className="text-3xl font-bold text-blue-800">{uniqueAcademies}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-200">
          <p className="text-sm font-medium text-amber-700">Clases Totales</p>
          <p className="text-3xl font-bold text-amber-800">{classRows.length}</p>
        </div>
      </div>

      <CoachAssignmentsPanel
        tenantId={tenantId}
        coaches={formattedCoaches}
        classGroups={classGroups}
      />
    </div>
  );
}


