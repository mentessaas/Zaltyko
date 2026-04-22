import { describe, expect, it } from "vitest";

import {
  getSpecializedEventTypes,
  getSpecializedEvaluationTemplate,
  getSpecializedLabels,
  resolveAcademySpecialization,
} from "@/lib/specialization/registry";
import { getAcademyNavigation } from "@/lib/navigation/registry";
import { getQuickActions } from "@/lib/quick-actions";
import { summarizeStarterClassSetup } from "@/lib/classes/starter-setup";
import { summarizeStarterGroupSetup } from "@/lib/groups/starter-setup";
import {
  getGroupTechnicalGuidance,
  getSpecializedClassNameSuggestions,
} from "@/lib/specialization/technical-guidance";

describe("academy specialization", () => {
  it("resolves Spain artistic female specialization from configured academy data", () => {
    const specialization = resolveAcademySpecialization({
      countryCode: "ES",
      academyType: "artistica",
      discipline: "artistic",
      disciplineVariant: "artistic_female",
      federationConfigVersion: "rfeg-2026-v1",
      specializationStatus: "configured",
    });

    expect(specialization.countryCode).toBe("ES");
    expect(specialization.disciplineVariant).toBe("artistic_female");
    expect(getSpecializedLabels(specialization).disciplineName).toBe("Gimnasia artística femenina");
    expect(getSpecializedEvaluationTemplate(specialization).apparatus.map((item) => item.code)).toEqual([
      "vt",
      "ub",
      "bb",
      "fx",
    ]);
  });

  it("infers a rhythmic specialization from legacy academyType data", () => {
    const specialization = resolveAcademySpecialization({
      country: "España",
      academyType: "ritmica",
    });

    expect(specialization.discipline).toBe("rhythmic");
    expect(specialization.disciplineVariant).toBe("rhythmic");
    expect(specialization.status).toBe("inferred");
  });

  it("specializes academy navigation labels for rhythmic academies", () => {
    const specialization = resolveAcademySpecialization({
      countryCode: "ES",
      academyType: "ritmica",
      disciplineVariant: "rhythmic",
      specializationStatus: "configured",
    });

    const nav = getAcademyNavigation({
      academyId: "academy-1",
      profileRole: "owner",
      membershipRole: "owner",
      specialization,
    });

    expect(nav.find((item) => item.key === "athletes")?.label).toBe("Gimnastas");
    expect(nav.find((item) => item.key === "classes")?.label).toBe("Entrenamientos");
  });

  it("specializes quick actions copy and hides reports when the feature is disabled", () => {
    const specialization = resolveAcademySpecialization({
      countryCode: "ES",
      academyType: "ritmica",
      disciplineVariant: "rhythmic",
      specializationStatus: "configured",
    });

    const quickActions = getQuickActions(specialization.labels, { reportsEnabled: false });

    expect(quickActions.find((action) => action.id === "add-athlete")?.label).toBe("Añadir gimnasta");
    expect(quickActions.find((action) => action.id === "create-class")?.label).toBe("Crear entrenamiento");
    expect(quickActions.some((action) => action.id === "create-report")).toBe(false);
  });

  it("specializes event type options for rhythmic academies", () => {
    const specialization = resolveAcademySpecialization({
      countryCode: "ES",
      academyType: "ritmica",
      disciplineVariant: "rhythmic",
      specializationStatus: "configured",
    });

    const eventTypes = getSpecializedEventTypes(specialization);

    expect(eventTypes.map((item) => item.label)).toContain("Control de conjunto");
    expect(eventTypes.map((item) => item.label)).toContain("Stage coreográfico");
  });

  it("summarizes starter class setup progress for specialized academies", () => {
    const specialization = resolveAcademySpecialization({
      countryCode: "ES",
      academyType: "artistica",
      disciplineVariant: "artistic_female",
      specializationStatus: "configured",
    });

    const summary = summarizeStarterClassSetup(specialization, [
      {
        id: "class-1",
        name: "Equipo Base · Entrenamiento",
        weekdays: [1, 3],
        startTime: "17:30",
        endTime: "19:00",
        capacity: 16,
        coaches: [{ id: "coach-1" }],
        groups: [{ id: "group-1" }],
      },
      {
        id: "class-2",
        name: "Equipo Escolar · Entrenamiento",
        weekdays: [],
        startTime: null,
        endTime: null,
        capacity: null,
        coaches: [],
        groups: [],
      },
    ]);

    expect(summary.expectedStarterClassCount).toBe(3);
    expect(summary.starterClassCount).toBe(2);
    expect(summary.readyCount).toBe(1);
    expect(summary.missingCoachCount).toBe(1);
    expect(summary.flexibleScheduleCount).toBe(1);
    expect(summary.missingCapacityCount).toBe(1);
    expect(summary.missingGroupCount).toBe(1);
    expect(summary.missingTemplateNames).toContain("Equipo Competición · Entrenamiento");
  });

  it("summarizes starter group setup progress for specialized academies", () => {
    const specialization = resolveAcademySpecialization({
      countryCode: "ES",
      academyType: "ritmica",
      disciplineVariant: "rhythmic",
      specializationStatus: "configured",
    });

    const summary = summarizeStarterGroupSetup(specialization, [
      {
        id: "group-1",
        name: "Conjunto Escolar",
        level: "Iniciación",
        coachId: "coach-1",
        athleteCount: 8,
      },
      {
        id: "group-2",
        name: "Conjunto Base",
        level: null,
        coachId: null,
        athleteCount: 0,
      },
    ]);

    expect(summary.expectedStarterGroupCount).toBe(3);
    expect(summary.starterGroupCount).toBe(2);
    expect(summary.readyCount).toBe(1);
    expect(summary.missingCoachCount).toBe(1);
    expect(summary.missingLevelCount).toBe(1);
    expect(summary.emptyGroupCount).toBe(1);
    expect(summary.missingTemplateNames).toContain("Conjunto Competición");
  });

  it("returns technical guidance and class suggestions for rhythmic academies", () => {
    const specialization = resolveAcademySpecialization({
      countryCode: "ES",
      academyType: "ritmica",
      disciplineVariant: "rhythmic",
      specializationStatus: "configured",
    });

    const suggestions = getSpecializedClassNameSuggestions(specialization);
    const guidance = getGroupTechnicalGuidance(specialization, "Junior");

    expect(suggestions.map((item) => item.name)).toContain("Pases de conjunto");
    expect(guidance.apparatus).toContain("Cinta");
    expect(guidance.focusAreas).toContain("Intercambios y sincronía de conjunto");
  });
});
