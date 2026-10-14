import {
  coversPeriod,
  findCoverageOverlaps,
  monthlyAthleteTariffOptionsSchema,
  pricePlanClassTemplateCoverageSchema,
} from "@/modules/billing/domain/monthly-athlete-tariff";

const organizationId = "10000000-0000-0000-0000-000000000001";
const locationId = "10000000-0000-0000-0000-000000000011";
const pricePlanId = "10000000-0000-0000-0000-000000000901";
const classTemplateId = "10000000-0000-0000-0000-000000000801";

function coverage(
  startsOn: string,
  endsOn: string | null,
  overrides: Partial<{
    organizationId: string;
    locationId: string;
    pricePlanId: string;
    classTemplateId: string;
  }> = {}
) {
  return pricePlanClassTemplateCoverageSchema.parse({
    organizationId,
    locationId,
    pricePlanId,
    classTemplateId,
    startsOn,
    endsOn,
    ...overrides,
  });
}

const firstCoveredEnrollment = {
  enrollmentId: "10000000-0000-0000-0000-000000000851",
  classTemplateId,
  className: "Clase Base",
  assignmentId: "10000000-0000-0000-0000-000000000861",
};

const secondCoveredEnrollment = {
  enrollmentId: "10000000-0000-0000-0000-000000000852",
  classTemplateId: "10000000-0000-0000-0000-000000000803",
  className: "Clase Complementaria",
  assignmentId: "10000000-0000-0000-0000-000000000862",
};

const line = {
  athleteId: "10000000-0000-0000-0000-000000000401",
  athleteName: "Atleta Sintética",
  pricePlanId,
  pricePlanName: "Tarifa mensual",
  amountCents: 3000,
  currency: "EUR",
  coveredEnrollments: [firstCoveredEnrollment, secondCoveredEnrollment],
};

describe("monthly athlete tariff coverage contract", () => {
  it("rejects impossible dates and inverted coverage ranges", () => {
    expect(
      pricePlanClassTemplateCoverageSchema.safeParse({
        organizationId,
        locationId,
        pricePlanId,
        classTemplateId,
        startsOn: "2026-02-30",
        endsOn: null,
      }).success
    ).toBe(false);
    expect(() => coverage("2026-11-01", "2026-10-31")).toThrow();
  });

  it("requires a single effective coverage row to span the entire monthly period", () => {
    const month = { startsOn: "2026-10-01", endsOn: "2026-10-31" };
    expect(coversPeriod(coverage("2026-09-01", null), month)).toBe(true);
    expect(coversPeriod(coverage("2026-10-02", null), month)).toBe(false);
    expect(coversPeriod(coverage("2026-10-01", "2026-10-30"), month)).toBe(
      false
    );
  });

  it("detects inclusive overlap only for the same tenant, location, plan and class", () => {
    const overlapping = [
      coverage("2026-10-01", "2026-10-31"),
      coverage("2026-10-31", "2026-10-31"),
      coverage("2026-11-01", null),
      coverage("2026-10-01", null, {
        pricePlanId: "20000000-0000-0000-0000-000000000901",
      }),
    ];

    expect(findCoverageOverlaps(overlapping)).toHaveLength(1);
  });

  it("allows one tariff line for an athlete with multiple explicit class links", () => {
    const result = monthlyAthleteTariffOptionsSchema.safeParse({
      lines: [line],
      conflicts: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a line without coverage, unsafe amounts, or repeated covered records", () => {
    expect(
      monthlyAthleteTariffOptionsSchema.safeParse({
        lines: [{ ...line, coveredEnrollments: [] }],
        conflicts: [],
      }).success
    ).toBe(false);
    expect(
      monthlyAthleteTariffOptionsSchema.safeParse({
        lines: [{ ...line, amountCents: Number.MAX_SAFE_INTEGER + 1 }],
        conflicts: [],
      }).success
    ).toBe(false);
    expect(
      monthlyAthleteTariffOptionsSchema.safeParse({
        lines: [
          {
            ...line,
            coveredEnrollments: [
              firstCoveredEnrollment,
              {
                ...secondCoveredEnrollment,
                enrollmentId: firstCoveredEnrollment.enrollmentId,
              },
            ],
          },
        ],
        conflicts: [],
      }).success
    ).toBe(false);
    expect(
      monthlyAthleteTariffOptionsSchema.safeParse({
        lines: [
          {
            ...line,
            coveredEnrollments: [
              firstCoveredEnrollment,
              {
                ...secondCoveredEnrollment,
                classTemplateId: firstCoveredEnrollment.classTemplateId,
              },
            ],
          },
        ],
        conflicts: [],
      }).success
    ).toBe(false);
    expect(
      monthlyAthleteTariffOptionsSchema.safeParse({
        lines: [
          {
            ...line,
            coveredEnrollments: [
              firstCoveredEnrollment,
              {
                ...secondCoveredEnrollment,
                assignmentId: firstCoveredEnrollment.assignmentId,
              },
            ],
          },
        ],
        conflicts: [],
      }).success
    ).toBe(false);
    expect(
      monthlyAthleteTariffOptionsSchema.safeParse({
        lines: [line, line],
        conflicts: [],
      }).success
    ).toBe(false);
  });

  it("caps the class label at the existing 120 character API limit", () => {
    expect(
      monthlyAthleteTariffOptionsSchema.safeParse({
        lines: [
          {
            ...line,
            coveredEnrollments: [
              { ...firstCoveredEnrollment, className: "a".repeat(121) },
            ],
          },
        ],
        conflicts: [],
      }).success
    ).toBe(false);
  });

  it("cannot return a quote line for an athlete with a blocking tariff conflict", () => {
    expect(
      monthlyAthleteTariffOptionsSchema.safeParse({
        lines: [line],
        conflicts: [
          {
            athleteId: line.athleteId,
            code: "ATHLETE_TARIFF_CONFLICT",
            enrollmentIds: [firstCoveredEnrollment.enrollmentId],
          },
        ],
      }).success
    ).toBe(false);
  });
});
