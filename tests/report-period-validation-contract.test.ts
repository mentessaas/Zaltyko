import { describe, expect, it } from "vitest";

import { reportDateSchema, validateReportPeriod } from "@/lib/reports/query-schemas";

describe("report period validation", () => {
  it("accepts ISO dates and treats an empty optional filter as absent", () => {
    expect(reportDateSchema.parse("2026-09-12")).toBe("2026-09-12");
    expect(reportDateSchema.parse("")).toBeUndefined();
    expect(reportDateSchema.parse(null)).toBeUndefined();
  });

  it("rejects malformed dates and inverted periods", () => {
    expect(() => reportDateSchema.parse("12/09/2026")).toThrow();
    const result = reportDateSchema.safeParse("2026-09-12");
    expect(result.success).toBe(true);

    const issues: Array<{ path: (string | number)[] }> = [];
    validateReportPeriod({ startDate: "2026-09-12", endDate: "2026-09-01" }, {
      addIssue(issue) {
        issues.push({ path: issue.path ?? [] });
      },
      path: [],
    });
    expect(issues).toEqual([{ path: ["endDate"] }]);
  });
});
