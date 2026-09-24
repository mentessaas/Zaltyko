import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { extractAssessmentRows } from "@/lib/assessments/response";
import {
  ASSESSMENT_TYPE_COLORS,
  ASSESSMENT_TYPE_FILTERS,
  ASSESSMENT_TYPE_LABELS,
} from "@/lib/assessments/presentation";

describe("assessment UI contracts", () => {
  it("mantiene etiquetas y estilos para todos los tipos canónicos y legacy", () => {
    for (const type of ASSESSMENT_TYPE_FILTERS) {
      expect(ASSESSMENT_TYPE_LABELS[type]).toBeTruthy();
      expect(ASSESSMENT_TYPE_COLORS[type]).toContain("bg-");
    }
  });

  it("lee el envelope estándar y las respuestas legacy sin convertir datos en vacío", () => {
    const item = { id: "assessment-1" };
    expect(extractAssessmentRows({ ok: true, data: [item] })).toEqual([item]);
    expect(extractAssessmentRows({ ok: true, data: { assessments: [item] } })).toEqual([item]);
    expect(extractAssessmentRows({ assessments: [item] })).toEqual([item]);
    expect(extractAssessmentRows({ ok: true, data: [] })).toEqual([]);
  });

  it("consume el envelope actual y mantiene el parámetro de selección de atleta", () => {
    const tab = readFileSync("src/components/assessments/AthleteEvaluationsTab.tsx", "utf8");
    const client = readFileSync("src/components/assessments/AssessmentsClientView.tsx", "utf8");
    const comparison = readFileSync("src/components/assessments/ProgressComparison.tsx", "utf8");
    expect(tab).toContain("extractAssessmentRows(payload)");
    expect(client).toContain("extractAssessmentRows(payload)");
    expect(comparison).toContain("ASSESSMENT_TYPE_LABELS[assessment.assessmentType]");
    expect(tab).toContain("/assessments?athleteId=${athleteId}");
  });

  it("trata assessmentDate como fecha de calendario y no como medianoche del navegador", () => {
    const files = [
      "src/components/assessments/AssessmentHistory.tsx",
      "src/components/assessments/AssessmentsClientView.tsx",
      "src/components/assessments/ProgressComparison.tsx",
      "src/components/assessments/ProgressChart.tsx",
      "src/components/assessments/AssessmentPDFExport.tsx",
      "src/components/athletes/AthleteHistoryView.tsx",
      "src/components/athletes/AthleteStatsOverview.tsx",
      "src/components/assessments/AssessmentForm.tsx",
      "src/components/assessment-form.tsx",
      "src/app/app/[academyId]/athletes/[athleteId]/progress/page.tsx",
      "src/components/athletes/ProgressTimeline.tsx",
    ];
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      if (file.includes("AssessmentForm") || file === "src/components/assessment-form.tsx") {
        expect(source).toContain("formatDateToISOString");
      } else {
        expect(source).toContain("formatDateForCountry");
        expect(source).not.toContain("format(new Date(assessment.assessmentDate)");
      }
    }
    const historyPage = readFileSync(
      "src/app/app/[academyId]/athletes/[athleteId]/history/page.tsx",
      "utf8"
    );
    expect(historyPage).toContain("dateValue.slice(0, 10)");
  });

  it("normaliza filtros de historial ausentes antes de validarlos", () => {
    const route = readFileSync(
      "src/app/api/athletes/[athleteId]/history/route.ts",
      "utf8"
    );
    expect(route).toContain('startDate: url.searchParams.get("startDate") || undefined');
    expect(route).toContain('endDate: url.searchParams.get("endDate") || undefined');
    expect(route).toContain('skillId: url.searchParams.get("skillId") || undefined');
  });
});
