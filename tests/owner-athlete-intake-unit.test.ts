import { describe, expect, it } from "vitest";

import {
  assertFirstAssignmentStartsOnLocalDate,
  assignOwnerAthleteIntakePayloadSchema,
  ownerAthleteIntakePayloadSchema,
} from "@/modules/athletes/application/owner-athlete-intake";
import { OperationalError } from "@/modules/shared/domain/operational-error";

const organizationId = "10000000-0000-4000-8000-000000000001";
const familyId = "10000000-0000-4000-8000-000000000002";

describe("contratos de alta organizativa de atleta", () => {
  it("normaliza nombres y exige fecha y relación familiar explícitas", () => {
    const result = ownerAthleteIntakePayloadSchema.parse({
      organizationId,
      givenName: "  Ángela   María ",
      familyName: "  Pérez  García ",
      family: {
        kind: "new",
        relationship: "parent",
        startsOn: "2026-10-25",
      },
    });

    expect(result.givenName).toBe("Ángela María");
    expect(result.familyName).toBe("Pérez García");
    expect(result.family.startsOn).toBe("2026-10-25");
  });

  it("acepta reutilizar una familia solo con su ID y vínculo explícitos", () => {
    expect(
      ownerAthleteIntakePayloadSchema.parse({
        organizationId,
        givenName: "Lucía",
        familyName: "Prueba",
        family: {
          kind: "existing",
          familyId,
          relationship: "other",
          startsOn: "2026-10-25",
        },
      }).family
    ).toMatchObject({ kind: "existing", familyId, relationship: "other" });
  });

  it("rechaza payer, guardian, identidad, campos desconocidos y fecha no civil", () => {
    const valid = {
      organizationId,
      givenName: "Lucía",
      familyName: "Prueba",
      family: { kind: "new", relationship: "parent", startsOn: "2026-10-25" },
    };
    expect(
      ownerAthleteIntakePayloadSchema.safeParse({
        ...valid,
        family: { ...valid.family, guardianId: familyId },
      }).success
    ).toBe(false);
    expect(
      ownerAthleteIntakePayloadSchema.safeParse({ ...valid, actor: { userId: familyId } }).success
    ).toBe(false);
    expect(
      ownerAthleteIntakePayloadSchema.safeParse({
        ...valid,
        family: { ...valid.family, startsOn: "2026-02-30" },
      }).success
    ).toBe(false);
  });

  it("exige grupo real y fecha de asignación civil explícita", () => {
    expect(
      assignOwnerAthleteIntakePayloadSchema.safeParse({
        organizationId,
        groupId: familyId,
        startsOn: "2026-10-25",
      }).success
    ).toBe(true);
    expect(
      assignOwnerAthleteIntakePayloadSchema.safeParse({
        organizationId,
        locationId: familyId,
        startsOn: "2026-10-25",
      }).success
    ).toBe(false);
    expect(
      assignOwnerAthleteIntakePayloadSchema.safeParse({
        organizationId,
        groupId: familyId,
        startsOn: "2026-02-30",
      }).success
    ).toBe(false);
  });

  it("solo permite la fecha civil actual de la sede en la primera asignación", () => {
    expect(() =>
      assertFirstAssignmentStartsOnLocalDate("2026-10-25", "2026-10-25")
    ).not.toThrow();
    for (const startsOn of ["2026-10-24", "2026-10-26"]) {
      expect(() =>
        assertFirstAssignmentStartsOnLocalDate(startsOn, "2026-10-25")
      ).toThrowError(OperationalError);
    }
  });
});
