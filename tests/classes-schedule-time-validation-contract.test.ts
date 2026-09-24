import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("class schedule time validation contract", () => {
  it("enforces the same time-range rule on create and update APIs", () => {
    const createRoute = read("src/app/api/classes/route.ts");
    const updateRoute = read("src/app/api/classes/[classId]/route.ts");

    expect(createRoute).toContain("isValidClassTimeRange(body.startTime, body.endTime)");
    expect(updateRoute).toContain("isValidClassTimeRange(finalStartTime, finalEndTime)");
    expect(createRoute).toContain('"INVALID_TIME_RANGE"');
    expect(updateRoute).toContain('"INVALID_TIME_RANGE"');
  });

  it("does not render a contradictory legacy range in operator views", () => {
    expect(read("src/components/dashboard/UpcomingClasses.tsx")).toContain("Horario por revisar");
    expect(read("src/components/classes/ClassDetailView.tsx")).toContain("formatClassTimeRange");
  });
});
