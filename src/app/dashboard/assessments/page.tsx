import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { FileText, Plus } from "lucide-react";

import { db } from "@/db";
import {
  athleteAssessments,
  assessmentScores,
  athletes,
  academies,
  memberships,
  profiles,
  skillCatalog,
} from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import AssessmentsClientView from "@/components/assessments/AssessmentsClientView";
import type { AssessmentWithScores, AssessmentType } from "@/types";

interface AssessmentsPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function AssessmentsPage({ searchParams }: AssessmentsPageProps) {
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

  let tenantId = profile.tenantId;

  if (!tenantId) {
    try {
      const userAcademies = await db
        .select({ tenantId: academies.tenantId })
        .from(memberships)
        .innerJoin(academies, eq(memberships.academyId, academies.id))
        .where(eq(memberships.userId, profile.id))
        .limit(1);
      if (userAcademies.length > 0) tenantId = userAcademies[0].tenantId;
    } catch {
      // ignore
    }
  }

  if (!tenantId && profile.role !== "super_admin") redirect("/dashboard");

  // User's academies for filter
  const userAcademies = await db
    .select({ id: academies.id, name: academies.name })
    .from(memberships)
    .innerJoin(academies, eq(memberships.academyId, academies.id))
    .where(eq(memberships.userId, user.id))
    .groupBy(academies.id, academies.name)
    .orderBy(academies.name);

  const academyIds = userAcademies.map((a) => a.id);

  // Athletes for selector
  const athletesForSelect = await db
    .select({ id: athletes.id, name: athletes.name, academyId: athletes.academyId })
    .from(athletes)
    .where(tenantId ? eq(athletes.tenantId, tenantId) : undefined)
    .orderBy(athletes.name)
    .limit(300);

  // Filters
  const academyParam =
    typeof searchParams.academy === "string" && searchParams.academy !== "" ? searchParams.academy : undefined;
  const athleteParam =
    typeof searchParams.athlete === "string" && searchParams.athlete !== "" ? searchParams.athlete : undefined;
  const typeParam =
    typeof searchParams.type === "string" &&
    ["technical", "artistic", "physical", "behavioral", "overall"].includes(searchParams.type)
      ? (searchParams.type as AssessmentType)
      : undefined;
  const fromParam =
    typeof searchParams.from === "string" && searchParams.from !== "" ? searchParams.from : undefined;
  const toParam =
    typeof searchParams.to === "string" && searchParams.to !== "" ? searchParams.to : undefined;

  // Build conditions
  const baseConditions = tenantId ? [eq(athleteAssessments.tenantId, tenantId)] : [];
  if (academyParam && academyIds.includes(academyParam)) {
    baseConditions.push(eq(athleteAssessments.academyId, academyParam));
  }
  if (athleteParam) baseConditions.push(eq(athleteAssessments.athleteId, athleteParam));
  if (typeParam) baseConditions.push(eq(athleteAssessments.assessmentType as any, typeParam));
  if (fromParam) baseConditions.push(gte(athleteAssessments.assessmentDate, fromParam));
  if (toParam) baseConditions.push(lte(athleteAssessments.assessmentDate, toParam));

  const whereClause = baseConditions.length > 1 ? and(...baseConditions) : baseConditions[0];

  // Pagination
  const page = typeof searchParams.page === "string" ? Number(searchParams.page) : 1;
  const perPage = 20;
  const offset = (page - 1) * perPage;

  // Total count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(athleteAssessments)
    .where(whereClause);

  const totalPages = Math.ceil(Number(count) / perPage);

  // Fetch assessments
  const assessmentRows = await db
    .select({
      id: athleteAssessments.id,
      athleteId: athleteAssessments.athleteId,
      athleteName: athletes.name,
      assessmentDate: athleteAssessments.assessmentDate,
      assessmentType: athleteAssessments.assessmentType,
      apparatus: athleteAssessments.apparatus,
      overallComment: athleteAssessments.overallComment,
    })
    .from(athleteAssessments)
    .leftJoin(athletes, eq(athleteAssessments.athleteId, athletes.id))
    .where(whereClause)
    .orderBy(desc(athleteAssessments.assessmentDate))
    .limit(perPage)
    .offset(offset);

  // Enrich with scores
  const assessments: AssessmentWithScores[] = await Promise.all(
    assessmentRows.map(async (row) => {
      const scores = await db
        .select({
          id: assessmentScores.id,
          skillId: assessmentScores.skillId,
          skillName: skillCatalog.name,
          score: assessmentScores.score,
          comments: assessmentScores.comments,
        })
        .from(assessmentScores)
        .where(eq(assessmentScores.assessmentId, row.id));

      const avgScore =
        scores.length > 0 ? scores.reduce((sum, s) => sum + s.score, 0) / scores.length : null;

      return {
        id: row.id,
        athleteId: row.athleteId,
        athleteName: row.athleteName ?? "Atleta",
        assessmentDate: row.assessmentDate,
        assessmentType: row.assessmentType as AssessmentType,
        apparatus: row.apparatus,
        overallComment: row.overallComment,
        assessedByName: null,
        scores: scores.map((s) => ({ ...s, criterionId: null })),
        videos: [],
        totalScore: null,
        averageScore: avgScore,
      };
    })
  );

  // Summary stats
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split("T")[0];

  const thisMonthConditions = [
    ...baseConditions,
    gte(athleteAssessments.assessmentDate, firstDayOfMonth),
  ];
  const monthWhere = thisMonthConditions.length > 1 ? and(...thisMonthConditions) : thisMonthConditions[0];

  const [{ monthCount }] = await db
    .select({ monthCount: sql<number>`count(*)` })
    .from(athleteAssessments)
    .where(monthWhere);

  const [{ totalCount }] = await db
    .select({ totalCount: sql<number>`count(*)` })
    .from(athleteAssessments)
    .where(tenantId ? eq(athleteAssessments.tenantId, tenantId) : undefined);

  // Athletes with at least one assessment
  const [{ athletesAssessed }] = await db
    .select({ athletesAssessed: sql<number>`count(distinct ${athleteAssessments.athleteId})` })
    .from(athleteAssessments)
    .where(tenantId ? eq(athleteAssessments.tenantId, tenantId) : undefined);

  const stats = {
    total: Number(totalCount),
    thisMonth: Number(monthCount),
    athletesAssessed: Number(athletesAssessed),
    totalAthletes: athletesForSelect.length,
  };

  return (
    <div className="space-y-6 p-4 md:p-8">
      <PageHeader
        breadcrumbs={[
          { label: "Dashboard", href: "/dashboard" },
          { label: "Evaluaciones" },
        ]}
        title="Evaluaciones"
        description="Historial de evaluaciones técnicas, artísticas y de condición física de tus atletas."
        icon={<FileText className="h-5 w-5" strokeWidth={1.5} />}
        actions={
          <Button asChild>
            <a href="/dashboard/athletes">
              <Plus className="h-4 w-4 mr-2" />
              Nueva evaluación
            </a>
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-xl p-4 border border-red-200">
          <p className="text-sm font-medium text-red-700">Total evaluaciones</p>
          <p className="text-3xl font-bold text-red-800">{stats.total}</p>
        </div>
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4 border border-blue-200">
          <p className="text-sm font-medium text-blue-700">Este mes</p>
          <p className="text-3xl font-bold text-blue-800">{stats.thisMonth}</p>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-xl p-4 border border-emerald-200">
          <p className="text-sm font-medium text-emerald-700">Atletas evaluados</p>
          <p className="text-3xl font-bold text-emerald-800">{stats.athletesAssessed}</p>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-amber-100 rounded-xl p-4 border border-amber-200">
          <p className="text-sm font-medium text-amber-700">Pendientes</p>
          <p className="text-3xl font-bold text-amber-800">
            {stats.totalAthletes - stats.athletesAssessed}
          </p>
        </div>
      </div>

      <AssessmentsClientView
        assessments={assessments}
        athletes={athletesForSelect.map((a) => ({ id: a.id, name: a.name }))}
        academies={userAcademies}
        searchParams={searchParams}
        page={page}
        totalPages={totalPages}
        totalCount={Number(count)}
        perPage={perPage}
      />
    </div>
  );
}
