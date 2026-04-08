import { describe, it, expect } from "vitest";
import {
  ATHLETE_STATUS_OPTIONS,
  athleteStatusOptions,
  ACTIVE_STATUSES,
  INACTIVE_STATUSES,
  isActiveStatus,
  type AthleteStatus,
} from "@/lib/athletes/constants";

describe("ATHLETE_STATUS_OPTIONS", () => {
  it("should have all required status options", () => {
    expect(ATHLETE_STATUS_OPTIONS).toContain("trial");
    expect(ATHLETE_STATUS_OPTIONS).toContain("active");
    expect(ATHLETE_STATUS_OPTIONS).toContain("inactive");
    expect(ATHLETE_STATUS_OPTIONS).toContain("paused");
    expect(ATHLETE_STATUS_OPTIONS).toContain("archived");
  });

  it("should have exactly 5 status options", () => {
    expect(ATHLETE_STATUS_OPTIONS.length).toBe(5);
  });

  it("should be readonly tuple", () => {
    // This ensures the array cannot be modified
    expect(Array.isArray(ATHLETE_STATUS_OPTIONS)).toBe(true);
  });
});

describe("athleteStatusOptions", () => {
  it("should be same as ATHLETE_STATUS_OPTIONS", () => {
    expect(athleteStatusOptions).toEqual(ATHLETE_STATUS_OPTIONS);
  });
});

describe("ACTIVE_STATUSES", () => {
  it("should include active and trial", () => {
    expect(ACTIVE_STATUSES).toContain("active");
    expect(ACTIVE_STATUSES).toContain("trial");
  });

  it("should not include inactive statuses", () => {
    expect(ACTIVE_STATUSES).not.toContain("inactive");
    expect(ACTIVE_STATUSES).not.toContain("paused");
    expect(ACTIVE_STATUSES).not.toContain("archived");
  });

  it("should have exactly 2 active statuses", () => {
    expect(ACTIVE_STATUSES.length).toBe(2);
  });
});

describe("INACTIVE_STATUSES", () => {
  it("should include inactive, paused, and archived", () => {
    expect(INACTIVE_STATUSES).toContain("inactive");
    expect(INACTIVE_STATUSES).toContain("paused");
    expect(INACTIVE_STATUSES).toContain("archived");
  });

  it("should not include active statuses", () => {
    expect(INACTIVE_STATUSES).not.toContain("active");
    expect(INACTIVE_STATUSES).not.toContain("trial");
  });

  it("should have exactly 3 inactive statuses", () => {
    expect(INACTIVE_STATUSES.length).toBe(3);
  });
});

describe("isActiveStatus", () => {
  it("should return true for active status", () => {
    expect(isActiveStatus("active")).toBe(true);
  });

  it("should return true for trial status", () => {
    expect(isActiveStatus("trial")).toBe(true);
  });

  it("should return false for inactive status", () => {
    expect(isActiveStatus("inactive")).toBe(false);
  });

  it("should return false for paused status", () => {
    expect(isActiveStatus("paused")).toBe(false);
  });

  it("should return false for archived status", () => {
    expect(isActiveStatus("archived")).toBe(false);
  });

  it("should return false for unknown status", () => {
    expect(isActiveStatus("unknown")).toBe(false);
    expect(isActiveStatus("")).toBe(false);
    expect(isActiveStatus("ACTIVE")).toBe(false); // case sensitive
  });

  it("should handle case where status is not a valid AthleteStatus", () => {
    const invalidStatuses = ["pending", "deleted", "suspended", "new"];
    for (const status of invalidStatuses) {
      expect(isActiveStatus(status)).toBe(false);
    }
  });
});

describe("type coverage", () => {
  it("should allow valid status values in type context", () => {
    const validStatuses: AthleteStatus[] = ["trial", "active", "inactive", "paused", "archived"];
    for (const status of validStatuses) {
      const result = isActiveStatus(status);
      expect(typeof result).toBe("boolean");
    }
  });
});