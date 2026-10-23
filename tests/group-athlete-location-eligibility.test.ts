import { describe, expect, it } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

import { hasEligibleGroupLocationRelationship } from "@/modules/groups/application/group-athlete-location-eligibility";

const organizationId = "60000000-0000-4000-8000-000000000001";
const groupId = "60000000-0000-4000-8000-000000000002";
const locationId = "60000000-0000-4000-8000-000000000003";

describe("ámbito de sede para añadir una gimnasta a un grupo", () => {
  it("limita la elegibilidad a relación abierta en la sede del grupo", () => {
    const compiled = new PgDialect().sqlToQuery(
      hasEligibleGroupLocationRelationship({ organizationId, groupId, locationId })
    );

    expect(compiled.sql).toContain("eligible_membership.athlete_id");
    expect(compiled.sql).toContain("eligible_group.location_id");
    expect(compiled.sql).toContain("eligible_enrollment.location_id");
    expect(compiled.sql).toContain("eligible_group.status = 'active'");
    expect(compiled.sql).toContain("eligible_membership.group_id <>");
    expect(compiled.params).toEqual(
      expect.arrayContaining([organizationId, groupId, locationId])
    );
    expect(compiled.sql).toContain("eligible_membership.status in");
    expect(compiled.sql).toContain("eligible_enrollment.status in");
  });
});
