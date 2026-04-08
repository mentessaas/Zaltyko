import { describe, it, expect } from "vitest";
import { validateUuid } from "@/lib/validators";

describe("validateUuid", () => {
  it("should return valid for correct UUIDs", () => {
    const validUuids = [
      "123e4567-e89b-12d3-a456-426614174000",
      "550e8400-e29b-41d4-a716-446655440000",
      "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    ];

    for (const uuid of validUuids) {
      const result = validateUuid(uuid);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    }
  });

  it("should return invalid for malformed UUIDs", () => {
    const invalidUuids = [
      "not-a-uuid",
      "123e4567-e89b-12d3-a456", // too short
      "123e4567-e89b-12d3-a456-42661417400g", // invalid char
      "123e4567e89b12d3a456426614174000", // missing dashes
      "123e4567-e89b-12d3-a456-42661417400", // missing final digit
      "", // empty string
      "123e4567-e89b-12d3-a456-4266141740001", // too long
    ];

    for (const uuid of invalidUuids) {
      const result = validateUuid(uuid);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    }
  });

  it("should return error message for invalid UUID", () => {
    const result = validateUuid("invalid");
    expect(result.error).toBe("Invalid UUID format");
  });

  it("should return valid for uppercase UUIDs", () => {
    const result = validateUuid("123E4567-E89B-12D3-A456-426614174000");
    expect(result.valid).toBe(true);
  });

  it("should return valid for mixed case UUIDs", () => {
    const result = validateUuid("123e4567-E89B-12d3-A456-426614174000");
    expect(result.valid).toBe(true);
  });
});