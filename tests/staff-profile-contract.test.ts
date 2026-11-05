import { describe, expect, it } from "vitest";

import {
  createOwnerStaffProfileSchema,
  decodeStaffProfileCursor,
  encodeStaffProfileCursor,
  normalizeStaffName,
  setOwnerStaffProfileActiveSchema,
  staffProfileVersionSchema,
  updateOwnerStaffProfileSchema,
} from "@/modules/staff/application/staff-profile-contract";

const organizationId = "ec2cc5ab-63d4-45a7-aacc-f0dd00550384";

describe("canonical staff profile contract", () => {
  it("normalizes names and keeps only the approved name fields", () => {
    const parsed = createOwnerStaffProfileSchema.parse({
      organizationId,
      givenName: "  Ana   María ",
      familyName: "  López  ",
      preferredName: " Ani  ",
    });

    expect(parsed).toEqual({
      organizationId,
      givenName: "Ana María",
      familyName: "López",
      preferredName: "Ani",
    });
    expect(normalizeStaffName(" Jose\u0301  Álvarez ")).toBe("José Álvarez");
  });

  it("rejects empty/control names and fields that would create or expose identity data", () => {
    expect(
      createOwnerStaffProfileSchema.safeParse({
        organizationId,
        givenName: "\n",
        familyName: "López",
      }).success
    ).toBe(false);
    expect(
      createOwnerStaffProfileSchema.safeParse({
        organizationId,
        givenName: "Ana",
        familyName: "López",
        dateOfBirth: "2000-01-01",
        email: "ana@example.invalid",
      }).success
    ).toBe(false);
    expect(
      updateOwnerStaffProfileSchema.safeParse({
        organizationId,
        staffProfileId: "3c18de5e-6363-4a08-8505-bf401282dfc1",
        givenName: "Ana",
        familyName: "López",
        version: `v1_${"a".repeat(64)}`,
      }).success
    ).toBe(false);
    expect(
      setOwnerStaffProfileActiveSchema.safeParse({
        organizationId,
        staffProfileId: "3c18de5e-6363-4a08-8505-bf401282dfc1",
        version: `v1_${"a".repeat(64)}`,
      }).success
    ).toBe(false);
  });

  it("accepts only versioned optimistic tokens and canonical cursors", () => {
    const id = "3c18de5e-6363-4a08-8505-bf401282dfc1";
    const cursor = encodeOwnerCursor(id);
    expect(decodeStaffProfileCursor(cursor)).toBe(id);
    expect(decodeStaffProfileCursor(`${cursor}=`)).toBeNull();
    expect(staffProfileVersionSchema.safeParse(`v1_${"f".repeat(64)}`).success).toBe(true);
    expect(staffProfileVersionSchema.safeParse("2026-11-05T00:00:00Z").success).toBe(false);
  });
});

function encodeOwnerCursor(id: string): string {
  return encodeStaffProfileCursor(id);
}
