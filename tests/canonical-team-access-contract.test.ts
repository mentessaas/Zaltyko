import { describe, expect, it } from "vitest";
import {
  createTeamInvitationSchema, teamIdempotencyKeySchema, teamRevisionSchema,
  teamTokenBodySchema, teamTokenSchema,
} from "@/modules/staff/domain/team-access-contract";

const organizationId = "5fb33113-5528-4268-846a-9941e5cd71ba";
const locationIds = ["b06f1c14-7342-4163-baf9-dc37c8518236", "13609ace-cb26-4e8e-9284-c86776d40530"];
const command = { organizationId, email: " Team@Example.invalid ", role: "coach", locationIds };

describe("canonical team access request contract", () => {
  it("normalizes email and orders an explicit non-empty unique location set", () => {
    expect(createTeamInvitationSchema.parse(command)).toEqual({ ...command, email: "team@example.invalid", locationIds: [...locationIds].sort() });
    for (const locations of [[], [locationIds[0], locationIds[0]], ["invalid"]]) {
      expect(createTeamInvitationSchema.safeParse({ ...command, locationIds: locations }).success).toBe(false);
    }
  });

  it("allows only manager and coach and rejects client-provided privilege/identity fields", () => {
    for (const role of ["owner", "admin", "parent", "OWNER"]) expect(createTeamInvitationSchema.safeParse({ ...command, role }).success).toBe(false);
    for (const extra of [{ userId: organizationId }, { locationScopeMode: "all" }, { expiresAt: "2099-01-01" }, { status: "active" }]) {
      expect(createTeamInvitationSchema.safeParse({ ...command, ...extra }).success).toBe(false);
    }
  });

  it("accepts only 256-bit base64url token shapes, never a URL or trusted email", () => {
    const token = "a".repeat(43);
    expect(teamTokenBodySchema.parse({ token })).toEqual({ token });
    for (const value of ["a".repeat(42), "a".repeat(44), `https://example.invalid/#token=${token}`, `${"a".repeat(42)}=`]) expect(teamTokenSchema.safeParse(value).success).toBe(false);
    expect(teamTokenBodySchema.safeParse({ token, email: "team@example.invalid" }).success).toBe(false);
  });

  it("requires a positive safe revision and a bounded idempotency key", () => {
    expect(teamRevisionSchema.parse('"12"')).toBe(12);
    expect(teamRevisionSchema.parse("12")).toBe(12);
    for (const revision of ["0", "-1", 'W/"12"', "1.5", "9007199254740992"]) expect(teamRevisionSchema.safeParse(revision).success).toBe(false);
    for (const key of ["short", "x".repeat(129), "with whitespace", "with\nnewline"]) expect(teamIdempotencyKeySchema.safeParse(key).success).toBe(false);
  });
});
