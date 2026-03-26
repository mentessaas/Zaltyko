import { describe, it, expect } from "vitest";
import { parseLevel, composeLevelLabel } from "@/lib/athletes/level-utils";
import { CATEGORY_OPTIONS, LEVEL_OPTIONS } from "@/types/athlete-edit";
import { ATHLETE_STATUS_COLORS } from "@/lib/status-colors";

describe("Athlete Level Parsing", () => {
  describe("parseLevel", () => {
    it("should parse all valid categories", () => {
      for (const category of CATEGORY_OPTIONS) {
        const result = parseLevel(`Categoría ${category} - Nivel 1`);
        expect(result.category).toBe(category);
      }
    });

    it("should parse all valid levels", () => {
      const testCases = [
        { input: "Nivel 1", expectedLevel: "1" },
        { input: "Nivel 5", expectedLevel: "5" },
        { input: "Nivel 10", expectedLevel: "10" },
        { input: "FIG", expectedLevel: "FIG" },
        { input: "Pre-nivel", expectedLevel: "Pre-nivel" },
      ];

      for (const { input, expectedLevel } of testCases) {
        const result = parseLevel(`Categoría A - ${input}`);
        expect(result.level).toBe(expectedLevel);
      }
    });

    it("should handle lowercase category parsing", () => {
      const result = parseLevel("categoría b - nivel 2");
      expect(result.category).toBe("B");
    });
  });

  describe("composeLevelLabel", () => {
    it("should create proper labels for all category combinations", () => {
      const result = composeLevelLabel("A", "1");
      expect(result).toBe("Categoría A · Nivel 1");
    });

    it("should handle all level types", () => {
      expect(composeLevelLabel("B", "FIG")).toBe("Categoría B · FIG");
      expect(composeLevelLabel("C", "Pre-nivel")).toBe("Categoría C · Pre-nivel");
    });
  });
});

describe("Athlete Data Validation", () => {
  it("should have valid status options", () => {
    const validStatuses = ["trial", "active", "inactive", "paused", "archived"];
    for (const status of validStatuses) {
      expect(ATHLETE_STATUS_COLORS).toHaveProperty(status);
    }
  });
});
