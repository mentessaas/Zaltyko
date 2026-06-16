import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { db } from "@/db";
import { academies, athletes, memberships, profiles, groups } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AssessmentForm from "@/components/assessments/AssessmentForm";
import { resolveAcademySpecialization } from "@/lib/specialization/registry";
import { resolveSpecializedApparatusCodes } from "@/lib/specialization/technical-guidance";

interface EvaluatePageProps {
  params: Promise<{
    academyId: string;
    athleteId: string;
  }>;
}

export default async function AthleteEvaluatePage({ params }: EvaluatePageProps) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const [profile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, user.id))
    .limit(1);

  if (!profile) redirect("/dashboard");

  const { academyId, athleteId } = await params;

  // Get athlete with academy
  const [athleteRow] = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      level: athletes.level,
      status: athletes.status,
      dob: athletes.dob,
      primaryApparatus: athletes.primaryApparatus,
      groupId: athletes.groupId,
      academyId: athletes.academyId,
      academyName: academies.name,
      academyType: academies.academyType,
      country: academies.country,
      countryCode: academies.countryCode,
      discipline: academies.discipline,
      disciplineVariant: academies.disciplineVariant,
      federationConfigVersion: academies.federationConfigVersion,
      specializationStatus: academies.specializationStatus,
      tenantId: athletes.tenantId,
    })
    .from(athletes)
    .innerJoin(academies, eq(athletes.academyId, academies.id))
    .where(eq(athletes.id, athleteId))
    .limit(1);

  if (!athleteRow) notFound();

  // Check access
  const membershipRows = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(and(eq(memberships.userId, user.id), eq(memberships.academyId, academyId)))
    .limit(1);

  const canAccess =
    profile.role === "super_admin" ||
    profile.role === "admin" ||
    profile.tenantId === athleteRow.tenantId ||
    membershipRows.length > 0;

  if (!canAccess) redirect("/dashboard");

  const specialization = resolveAcademySpecialization({
    academyType: athleteRow.academyType,
    country: athleteRow.country,
    countryCode: athleteRow.countryCode,
    discipline: athleteRow.discipline,
    disciplineVariant: athleteRow.disciplineVariant,
    federationConfigVersion: athleteRow.federationConfigVersion,
    specializationStatus: athleteRow.specializationStatus,
  });
  const [groupRow] = athleteRow.groupId
    ? await db
        .select({
          id: groups.id,
          name: groups.name,
          technicalFocus: groups.technicalFocus,
          apparatus: groups.apparatus,
        })
        .from(groups)
        .where(eq(groups.id, athleteRow.groupId))
        .limit(1)
    : [];

  const contextualApparatusCodes = resolveSpecializedApparatusCodes(
    specialization,
    [
      ...(athleteRow.primaryApparatus ? [athleteRow.primaryApparatus] : []),
      ...((groupRow?.apparatus ?? []) as string[]),
    ]
  );
  const apparatusList =
    contextualApparatusCodes.length > 0
      ? contextualApparatusCodes
      : specialization.evaluation.apparatus.map((item) => item.code);
  const recommendedFocus = groupRow?.technicalFocus ?? null;

  return (
    <div className="space-y-6 p-4 md:p-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="space-y-1">
          <Link
            href={`/app/${academyId}/athletes/${athleteId}/progress`}
            className="text-sm text-muted-foreground hover:underline inline-flex items-center gap-1"
          >
            <ArrowLeft className="h-3 w-3" />
            Volver al progreso
          </Link>
          <h1 className="text-2xl md:text-3xl font-semibold">
            Evaluar {specialization.labels.athleteSingular.toLowerCase()}
          </h1>
          <p className="text-muted-foreground">
            {athleteRow.name} · {athleteRow.academyName} · {specialization.labels.disciplineName}
          </p>
        </div>
      </div>

      {/* Assessment Form */}
      <Card>
        <CardHeader>
          <CardTitle> Nueva evaluación técnica</CardTitle>
        </CardHeader>
        <CardContent>
          <AssessmentForm
            athleteId={athleteId}
            athleteName={athleteRow.name}
            apparatusList={apparatusList}
            recommendedFocus={recommendedFocus}
            onSuccess={() => {
              // Redirect to progress page on success
              redirect(`/app/${academyId}/athletes/${athleteId}/progress`);
            }}
            onCancel={() => redirect(`/app/${academyId}/athletes/${athleteId}/progress`)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
