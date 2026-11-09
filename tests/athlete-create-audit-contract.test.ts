import { describe, expect, it } from "vitest";
import { matchesAthleteCreateAuditAfter } from "@/modules/groups/application/athlete-create-audit-contract";

const groupId = "20000000-0000-4000-8000-000000000005";
const membershipId = "20000000-0000-4000-8000-000000000007";

describe("contrato de auditoría del alta de gimnasta", () => {
  it("acepta el after que emite createAthleteForGroup", () => {
    const emittedAfter = { groupId, membershipId };
    expect(matchesAthleteCreateAuditAfter(emittedAfter, groupId, membershipId)).toBe(true);
  });

  it("rechaza relaciones distintas o campos ajenos al contrato", () => {
    expect(matchesAthleteCreateAuditAfter({ groupId, membershipId }, groupId, "20000000-0000-4000-8000-000000000099")).toBe(false);
    expect(matchesAthleteCreateAuditAfter({ groupId, membershipId, givenName: "Ada" }, groupId, membershipId)).toBe(false);
  });
});
