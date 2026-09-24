import { describe, expect, it } from "vitest";

import { formatClassTimeRange, isValidClassTimeRange } from "@/lib/classes/time-validation";

describe("class time validation", () => {
  it("accepts open schedules and valid same-day ranges", () => {
    expect(isValidClassTimeRange(null, null)).toBe(true);
    expect(isValidClassTimeRange("09:00", null)).toBe(true);
    expect(isValidClassTimeRange("09:00", "10:30")).toBe(true);
    expect(isValidClassTimeRange("09:00:00", "10:30:00")).toBe(true);
  });

  it("rejects invalid or backwards ranges", () => {
    expect(isValidClassTimeRange("09:00", "09:00")).toBe(false);
    expect(isValidClassTimeRange("09:00", "08:00")).toBe(false);
    expect(isValidClassTimeRange("25:00", "26:00")).toBe(false);
  });

  it("never renders a contradictory range", () => {
    expect(formatClassTimeRange("09:00", "08:00")).toBe("Horario por revisar");
    expect(formatClassTimeRange("09:00", null)).toBe("Desde 09:00");
  });
});
