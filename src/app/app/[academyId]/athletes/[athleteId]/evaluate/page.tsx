import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { db } from "@/db";
import { academies, athletes, memberships, profiles } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import AssessmentForm from "@/components/assessments/AssessmentForm";

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
      academyId: athletes.academyId,
      academyName: academies.name,
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

  // Determine apparatus list based on academy type
  const APPARATUS_BY_TYPE: Record<string, string[]> = {
    ritmica: ["rope", "ball", "clubs", "hoop", "ribbon"],
    artistica: ["vt", "ub", "bb", "fx"],
    trampolin: ["trampoline"],
    parkour: ["parkour"],
    default: ["rope", "ball", "clubs", "hoop", "ribbon"],
  };

  const academyType = athleteRow.academyId === academyId
    ? "ritmica" // Default for now, could be enriched from academy data
    : "ritmica";

  const apparatusList = APPARATUS_BY_TYPE[academyType] || APPARATUS_BY_TYPE.default;

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
          <h1 className="text-2xl md:text-3xl font-semibold">Evaluar atleta</h1>
          <p className="text-muted-foreground">
            {athleteRow.name} · {athleteRow.academyName}
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
