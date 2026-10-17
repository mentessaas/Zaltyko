import { describe, expect, it } from "vitest";

import { metricResultSchema } from "@/modules/analytics/domain/metric-contracts";
import {
  canTransitionEnrollment,
  transferEnrollmentSchema,
} from "@/modules/enrollments/domain/contracts";
import { parseDomainEvent } from "@/modules/events/domain/domain-event";
import {
  canAccessLocation,
  organizationContextSchema,
} from "@/modules/organizations/domain/contracts";
import { calculateEffectiveCapacity } from "@/modules/scheduling/domain/capacity";

const ID = {
  organization: "00000000-0000-4000-8000-000000000001",
  member: "00000000-0000-4000-8000-000000000002",
  user: "00000000-0000-4000-8000-000000000003",
  locationA: "00000000-0000-4000-8000-000000000004",
  locationB: "00000000-0000-4000-8000-000000000005",
  enrollment: "00000000-0000-4000-8000-000000000006",
  classTemplate: "00000000-0000-4000-8000-000000000007",
  event: "00000000-0000-4000-8000-000000000008",
} as const;

describe("contratos del dominio Zaltyko", () => {
  it("aplica el scope de sede de forma explícita", () => {
    const context = organizationContextSchema.parse({
      organizationId: ID.organization,
      locationId: ID.locationA,
      memberId: ID.member,
      userId: ID.user,
      role: "manager",
      locationScopeMode: "selected",
      allowedLocationIds: [ID.locationA],
    });

    expect(canAccessLocation(context, ID.locationA)).toBe(true);
    expect(canAccessLocation(context, ID.locationB)).toBe(false);
  });

  it("mantiene terminales cancelada y completada", () => {
    expect(canTransitionEnrollment("pending", "active")).toBe(true);
    expect(canTransitionEnrollment("active", "paused")).toBe(true);
    expect(canTransitionEnrollment("cancelled", "active")).toBe(false);
    expect(canTransitionEnrollment("completed", "paused")).toBe(false);
  });

  it("exige versión esperada e idempotencia al transferir", () => {
    expect(() =>
      transferEnrollmentSchema.parse({
        organizationId: ID.organization,
        enrollmentId: ID.enrollment,
        expectedVersion: 0,
        idempotencyKey: "corta",
        targetLocationId: ID.locationB,
        targetClassTemplateId: ID.classTemplate,
        startsOn: "2026-10-07",
        sourceStatus: "active",
      })
    ).toThrow();
  });

  it("calcula capacidad con el límite físico más restrictivo", () => {
    expect(
      calculateEffectiveCapacity({
        templateCapacity: 20,
        spaceCapacity: 18,
        sessionCapacityOverride: 19,
      })
    ).toBe(18);
  });

  it("rechaza PII y datos médicos en payloads analíticos", () => {
    expect(() =>
      parseDomainEvent({
        eventId: ID.event,
        eventName: "enrollment.activated",
        eventVersion: 1,
        organizationId: ID.organization,
        locationId: ID.locationA,
        occurredAt: "2026-10-06T08:00:00+02:00",
        actor: { type: "user", id: ID.user },
        entity: { type: "enrollment", id: ID.enrollment },
        idempotencyKey: "enrollment-activate-1",
        payload: { athleteId: ID.user, medicalNotes: "no permitido" },
      })
    ).toThrow(/campo restringido/);
  });

  it("no convierte datos insuficientes en cero", () => {
    expect(() =>
      metricResultSchema.parse({
        organizationId: ID.organization,
        locationId: ID.locationA,
        metricCode: "class_fill_rate",
        definitionVersion: 1,
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
        value: 0,
        numerator: 0,
        denominator: 0,
        coverage: 0.2,
        qualityStatus: "insufficient",
        dimensions: {},
        calculatedAt: "2026-10-06T08:00:00+02:00",
        sourceWatermark: "2026-10-06T07:45:00+02:00",
      })
    ).toThrow(/no publica un valor/);
  });
});
