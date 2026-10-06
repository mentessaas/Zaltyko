import { describe, expect, it } from "vitest";

import {
  calculateInsightPriority,
  evaluateCapacityWithoutPrice,
  evaluateCriticalDataMissing,
  evaluateExcessDemand,
  evaluateIncompleteAttendance,
  evaluateLowTrialConversion,
  evaluateOverdueCollections,
  evaluateSessionWithoutCoach,
  evaluateTrialWithoutFollowup,
  evaluateUnderutilizedClass,
} from "@/modules/insights/domain/insight-rules";

describe("insight rules", () => {
  it("aplica exactamente la fórmula de prioridad del PRD", () => {
    expect(
      calculateInsightPriority({
        impactScore: 80,
        urgencyScore: 60,
        confidenceScore: 90,
        actionabilityScore: 100,
      })
    ).toBe(80);
  });

  it("no crea demanda excedente por debajo de los umbrales", () => {
    expect(
      evaluateExcessDemand({
        classTemplateId: "30000000-0000-0000-0000-000000000801",
        fillRate: 0.89,
        eligibleWaitlist: 3,
        observedSessions: 4,
      })
    ).toBeNull();
  });

  it("explica el rango sin prometer ingreso", () => {
    const candidate = evaluateExcessDemand({
      classTemplateId: "30000000-0000-0000-0000-000000000801",
      fillRate: 0.92,
      eligibleWaitlist: 3,
      observedSessions: 4,
      monthlyPriceMinor: 6000,
      currency: "EUR",
    });

    expect(candidate).not.toBeNull();
    expect(candidate?.estimatedValueMinMinor).toBe(9000);
    expect(candidate?.estimatedValueMaxMinor).toBe(18000);
    expect(candidate?.assumptions.join(" ")).toContain("no garantiza");
    expect(candidate?.ctaKey).toBe("simulate_group");
  });

  it("evalúa las ocho reglas agregadas activas con umbrales estrictos", () => {
    const rules = [
      evaluateUnderutilizedClass({
        classTemplateId: "30000000-0000-0000-0000-000000000801",
        fillRate: 0.49,
        observedSessions: 4,
      }),
      evaluateOverdueCollections({
        overdueBalanceMinor: 12000,
        currency: "EUR",
        oldestAgeDays: 3,
        affectedFamilyCount: 2,
      }),
      evaluateIncompleteAttendance({
        sessionId: "30000000-0000-0000-0000-000000000802",
        hoursAfterEnd: 13,
        incompleteRecordCount: 1,
      }),
      evaluateTrialWithoutFollowup({
        trialId: "30000000-0000-0000-0000-000000000803",
        hoursSinceCompletion: 25,
      }),
      evaluateLowTrialConversion({
        completedTrialCount: 10,
        convertedTrialCount: 5,
        targetConversionRate: 0.6,
      }),
      evaluateCapacityWithoutPrice({
        classTemplateId: "30000000-0000-0000-0000-000000000804",
        openCapacity: 2,
        hasActivePrice: false,
        commerciallyOpen: true,
      }),
      evaluateSessionWithoutCoach({
        sessionId: "30000000-0000-0000-0000-000000000805",
        hoursUntilStart: 71,
        assignedCoachCount: 0,
      }),
      evaluateCriticalDataMissing({
        entityType: "class_template",
        entityId: "30000000-0000-0000-0000-000000000806",
        missingFields: ["capacity", "email", "medical_notes", "price"],
      }),
    ];

    expect(rules.every(Boolean)).toBe(true);
    const encoded = JSON.stringify(rules);
    expect(encoded).not.toMatch(/email|medical_notes|phone|address/i);
    expect(rules[7]?.evidence).toEqual({
      missingFields: ["capacity", "price"],
      blocksMetric: true,
    });
  });

  it("no emite candidatos cuando faltan bases o ya se cruzó a estado sano", () => {
    expect(
      evaluateUnderutilizedClass({
        classTemplateId: "30000000-0000-0000-0000-000000000801",
        fillRate: 0.5,
        observedSessions: 4,
      })
    ).toBeNull();
    expect(
      evaluateOverdueCollections({
        overdueBalanceMinor: 1000,
        currency: "EUR",
        oldestAgeDays: 2,
        affectedFamilyCount: 1,
      })
    ).toBeNull();
    expect(
      evaluateLowTrialConversion({
        completedTrialCount: 9,
        convertedTrialCount: 0,
        targetConversionRate: 0.6,
      })
    ).toBeNull();
    expect(
      evaluateLowTrialConversion({
        completedTrialCount: 10,
        convertedTrialCount: 0,
      })
    ).toBeNull();
    expect(
      evaluateCapacityWithoutPrice({
        classTemplateId: "30000000-0000-0000-0000-000000000804",
        openCapacity: 2,
        hasActivePrice: false,
        commerciallyOpen: false,
      })
    ).toBeNull();
  });
});
