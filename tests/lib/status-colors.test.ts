import { describe, it, expect } from "vitest";
import {
  ATHLETE_STATUS_COLORS,
  ATTENDANCE_STATUS_COLORS,
  getAthleteStatusColor,
  getAttendanceStatusColor,
} from "@/lib/status-colors";

describe("ATHLETE_STATUS_COLORS", () => {
  it("should have all required statuses", () => {
    expect(ATHLETE_STATUS_COLORS).toHaveProperty("trial");
    expect(ATHLETE_STATUS_COLORS).toHaveProperty("active");
    expect(ATHLETE_STATUS_COLORS).toHaveProperty("inactive");
    expect(ATHLETE_STATUS_COLORS).toHaveProperty("paused");
    expect(ATHLETE_STATUS_COLORS).toHaveProperty("archived");
  });

  it("should have all required color variants for each status", () => {
    const variants = ["bg", "bgLight", "border", "text", "textLight"];
    for (const status of Object.keys(ATHLETE_STATUS_COLORS)) {
      for (const variant of variants) {
        expect(ATHLETE_STATUS_COLORS[status as keyof typeof ATHLETE_STATUS_COLORS]).toHaveProperty(variant);
      }
    }
  });
});

describe("ATTENDANCE_STATUS_COLORS", () => {
  it("should have all required statuses", () => {
    expect(ATTENDANCE_STATUS_COLORS).toHaveProperty("present");
    expect(ATTENDANCE_STATUS_COLORS).toHaveProperty("absent");
    expect(ATTENDANCE_STATUS_COLORS).toHaveProperty("excused");
    expect(ATTENDANCE_STATUS_COLORS).toHaveProperty("late");
  });

  it("should have all required color variants for each status", () => {
    const variants = ["bg", "bgLight", "border", "text"];
    for (const status of Object.keys(ATTENDANCE_STATUS_COLORS)) {
      for (const variant of variants) {
        expect(ATTENDANCE_STATUS_COLORS[status as keyof typeof ATTENDANCE_STATUS_COLORS]).toHaveProperty(variant);
      }
    }
  });
});

describe("getAthleteStatusColor", () => {
  it("should return correct color for valid status", () => {
    expect(getAthleteStatusColor("active", "bg")).toBe("bg-emerald-500");
    expect(getAthleteStatusColor("trial", "text")).toBe("text-amber-600");
    expect(getAthleteStatusColor("inactive", "bgLight")).toBe("bg-gray-50");
  });

  it("should return inactive color for unknown status", () => {
    expect(getAthleteStatusColor("unknown", "bg")).toBe("bg-gray-500");
  });

  it("should default to bg variant", () => {
    expect(getAthleteStatusColor("active")).toBe("bg-emerald-500");
  });

  it("should work with all variants", () => {
    const variants = ["bg", "bgLight", "border", "text", "textLight"] as const;
    for (const variant of variants) {
      expect(getAthleteStatusColor("active", variant)).toBeTruthy();
    }
  });
});

describe("getAttendanceStatusColor", () => {
  it("should return correct color for valid status", () => {
    expect(getAttendanceStatusColor("present", "bg")).toBe("bg-emerald-500");
    expect(getAttendanceStatusColor("absent", "text")).toBe("text-red-600");
    expect(getAttendanceStatusColor("late", "bgLight")).toBe("bg-orange-50");
  });

  it("should return default gray color for unknown status", () => {
    expect(getAttendanceStatusColor("unknown", "bg")).toBe("bg-gray-500");
  });

  it("should default to bg variant", () => {
    expect(getAttendanceStatusColor("present")).toBe("bg-emerald-500");
  });

  it("should work with all variants", () => {
    const variants = ["bg", "bgLight", "border", "text"] as const;
    for (const variant of variants) {
      expect(getAttendanceStatusColor("present", variant)).toBeTruthy();
    }
  });
});
