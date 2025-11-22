import { db } from "@/db";
import {
  athleteAssessments,
  assessmentScores,
  athletes,
  skillCatalog,
  coaches,
} from "@/db/schema";
import { eq, and, gte, lte, desc, inArray } from "drizzle-orm";

export interface ProgressReportFilters {
  academyId: string;
  tenantId: string;
  athleteId: string;
  startDate?: Date;
  endDate?: Date;
  skillId?: string;
}

export interface SkillProgress {
  skillId: string;
  skillName: string;
  firstScore: number | null;
  lastScore: number | null;
  improvement: number;
  trend: "improving" | "declining" | "stable";
  assessments: Array<{
    date: string;
    score: number;
    comments: string | null;
  }>;
}

export interface ProgressReport {
  athleteId: string;
  athleteName: string;
  totalAssessments: number;
  period: {
    start: Date;
    end: Date;
  };
  skills: SkillProgress[];
  overallImprovement: number;
  areasOfImprovement: string[];
  areasOfConcern: string[];
}

/**
 * Analiza el progreso de un atleta
 */
export async function analyzeAthleteProgress(
  filters: ProgressReportFilters
): Promise<ProgressReport | null> {
  const whereConditions = [
    eq(athleteAssessments.tenantId, filters.tenantId),
    eq(athleteAssessments.academyId, filters.academyId),
    eq(athleteAssessments.athleteId, filters.athleteId),
  ];

  if (filters.startDate) {
    whereConditions.push(gte(athleteAssessments.assessmentDate, filters.startDate));
  }
  if (filters.endDate) {
    whereConditions.push(lte(athleteAssessments.assessmentDate, filters.endDate));
  }

  // Obtener evaluaciones
  const assessments = await db
    .select({
      id: athleteAssessments.id,
      assessmentDate: athleteAssessments.assessmentDate,
    })
    .from(athleteAssessments)
    .where(and(...whereConditions))
    .orderBy(desc(athleteAssessments.assessmentDate));

  if (assessments.length === 0) {
    return null;
  }

  // Obtener información del atleta
  const [athlete] = await db
    .select({
      id: athletes.id,
      name: athletes.name,
    })
    .from(athletes)
    .where(eq(athletes.id, filters.athleteId))
    .limit(1);

  if (!athlete) {
    return null;
  }

  const assessmentIds = assessments.map((a) => a.id);

  // Obtener todos los scores
  const scores = await db
    .select({
      assessmentId: assessmentScores.assessmentId,
      skillId: assessmentScores.skillId,
      skillName: skillCatalog.name,
      score: assessmentScores.score,
      comments: assessmentScores.comments,
      assessmentDate: athleteAssessments.assessmentDate,
    })
    .from(assessmentScores)
    .innerJoin(athleteAssessments, eq(assessmentScores.assessmentId, athleteAssessments.id))
    .innerJoin(skillCatalog, eq(assessmentScores.skillId, skillCatalog.id))
    .where(
      and(
        eq(assessmentScores.tenantId, filters.tenantId),
        inArray(assessmentScores.assessmentId, assessmentIds)
      )
    );

  // Agrupar por habilidad
  const skillMap = new Map<
    string,
    {
      skillName: string;
      scores: Array<{ date: Date; score: number; comments: string | null }>;
    }
  >();

  for (const score of scores) {
    const current = skillMap.get(score.skillId) || {
      skillName: score.skillName || "Habilidad",
      scores: [],
    };

    current.scores.push({
      date: score.assessmentDate,
      score: score.score,
      comments: score.comments,
    });

    skillMap.set(score.skillId, current);
  }

  // Calcular progreso por habilidad
  const skills: SkillProgress[] = [];
  const areasOfImprovement: string[] = [];
  const areasOfConcern: string[] = [];

  for (const [skillId, data] of skillMap.entries()) {
    const sortedScores = data.scores.sort((a, b) => a.date.getTime() - b.date.getTime());
    const firstScore = sortedScores[0]?.score || null;
    const lastScore = sortedScores[sortedScores.length - 1]?.score || null;

    let improvement = 0;
    let trend: "improving" | "declining" | "stable" = "stable";

    if (firstScore !== null && lastScore !== null) {
      improvement = lastScore - firstScore;
      if (improvement > 2) {
        trend = "improving";
        areasOfImprovement.push(data.skillName);
      } else if (improvement < -2) {
        trend = "declining";
        areasOfConcern.push(data.skillName);
      }
    }

    skills.push({
      skillId,
      skillName: data.skillName,
      firstScore,
      lastScore,
      improvement,
      trend,
      assessments: sortedScores.map((s) => ({
        date: s.date.toISOString().split("T")[0],
        score: s.score,
        comments: s.comments,
      })),
    });
  }

  // Calcular mejora general (promedio de mejoras)
  const overallImprovement =
    skills.length > 0
      ? skills.reduce((sum, s) => sum + s.improvement, 0) / skills.length
      : 0;

  const sortedAssessments = assessments.sort(
    (a, b) => a.assessmentDate.getTime() - b.assessmentDate.getTime()
  );

  return {
    athleteId: athlete.id,
    athleteName: athlete.name || "Sin nombre",
    totalAssessments: assessments.length,
    period: {
      start: sortedAssessments[0].assessmentDate,
      end: sortedAssessments[sortedAssessments.length - 1].assessmentDate,
    },
    skills: skills.sort((a, b) => b.improvement - a.improvement),
    overallImprovement: Math.round(overallImprovement * 100) / 100,
    areasOfImprovement,
    areasOfConcern,
  };
}

/**
 * Compara evaluaciones entre dos períodos
 */
export async function compareAssessments(
  filters: ProgressReportFilters,
  period1: { start: Date; end: Date },
  period2: { start: Date; end: Date }
): Promise<{
  period1: ProgressReport | null;
  period2: ProgressReport | null;
  comparison: Array<{
    skillId: string;
    skillName: string;
    period1Score: number | null;
    period2Score: number | null;
    change: number;
  }>;
}> {
  const [report1, report2] = await Promise.all([
    analyzeAthleteProgress({ ...filters, startDate: period1.start, endDate: period1.end }),
    analyzeAthleteProgress({ ...filters, startDate: period2.start, endDate: period2.end }),
  ]);

  const comparison: Array<{
    skillId: string;
    skillName: string;
    period1Score: number | null;
    period2Score: number | null;
    change: number;
  }> = [];

  if (report1 && report2) {
    const skillMap = new Map<string, { name: string; score: number | null }>();

    for (const skill of report1.skills) {
      skillMap.set(skill.skillId, { name: skill.skillName, score: skill.lastScore });
    }

    for (const skill of report2.skills) {
      const period1Data = skillMap.get(skill.skillId);
      const period1Score = period1Data?.score || null;
      const period2Score = skill.lastScore;
      const change = period1Score !== null && period2Score !== null ? period2Score - period1Score : 0;

      comparison.push({
        skillId: skill.skillId,
        skillName: skill.skillName,
        period1Score,
        period2Score,
        change,
      });
    }
  }

  return {
    period1: report1,
    period2: report2,
    comparison,
  };
}

