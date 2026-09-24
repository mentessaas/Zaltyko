import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const files = [
  "src/components/calendar/AgendaView.tsx",
  "src/components/dashboard/FinancialSection.tsx",
  "src/components/dashboard/QuickAction.tsx",
  "src/components/dashboard/PopularClassesWidget.tsx",
  "src/components/dashboard/RecommendationsWidget.tsx",
  "src/components/dashboard/RevenueTrendChart.tsx",
  "src/components/dashboard/DashboardSections.tsx",
  "src/components/dashboard/UpcomingClasses.tsx",
  "src/components/dashboard/TodayClassesWidget.tsx",
  "src/components/dashboard/UpcomingEventsWidget.tsx",
  "src/components/dashboard/AttendanceRiskWidget.tsx",
];

describe("dashboard theme consistency", () => {
  it("uses semantic surfaces for dashboard and agenda states", () => {
    for (const file of files) {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
      expect(source, file).not.toMatch(/(?:bg|hover:bg)-zaltyko-white|text-zaltyko-navy/);
    }
  });
});
