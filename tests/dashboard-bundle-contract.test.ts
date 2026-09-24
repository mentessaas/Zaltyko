import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const dashboardCard = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/DashboardCard.tsx"),
  "utf8",
);
const dashboardPage = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/DashboardPage.tsx"),
  "utf8",
);
const onboardingChecklist = readFileSync(
  resolve(process.cwd(), "src/components/dashboard/OnboardingChecklist.tsx"),
  "utf8",
);
const dashboardDataHook = readFileSync(
  resolve(process.cwd(), "src/hooks/useDashboardData.ts"),
  "utf8",
);

describe("dashboard critical chunk contract", () => {
  it("loads the KPI sparkline lazily instead of bundling Recharts statically", () => {
    expect(dashboardCard).toContain('import dynamic from "next/dynamic"');
    expect(dashboardCard).toContain('import("./Sparkline")');
    expect(dashboardCard).toContain("ssr: false");
    expect(dashboardCard).not.toContain('import { Sparkline } from "./Sparkline"');
    expect(dashboardCard).not.toContain('from "recharts"');
  });

  it("keeps secondary dashboard widgets out of the critical chunk", () => {
    expect(dashboardPage).toContain('import dynamic from "next/dynamic"');
    for (const component of [
      "RecommendationsWidget",
      "QuickActionsWidget",
      "TodayClassesWidget",
      "UpcomingClasses",
      "AlertsWidget",
      "UpcomingEventsWidget",
    ]) {
      expect(dashboardPage).toContain(`import(\"@/components/dashboard/${component}\")`);
    }
    expect(dashboardPage).not.toContain('import { UpcomingClasses } from "@/components/dashboard/UpcomingClasses"');
    expect(dashboardPage).not.toContain('import { AlertsWidget } from "@/components/dashboard/AlertsWidget"');
  });

  it("keeps pure onboarding navigation out of the visual checklist chunk", () => {
    expect(dashboardPage).toContain('import { ITEM_ROUTES } from "@/lib/onboarding-routes"');
    expect(onboardingChecklist).toContain('import { ITEM_ROUTES } from "@/lib/onboarding-routes"');
    expect(onboardingChecklist).toContain('export { ITEM_ROUTES } from "@/lib/onboarding-routes"');
    expect(onboardingChecklist).not.toContain("export const ITEM_ROUTES:");
  });

  it("defers Supabase realtime until after the dashboard can render", () => {
    expect(dashboardDataHook).toContain('import("@/lib/supabase/client")');
    expect(dashboardDataHook).not.toContain('import { createClient } from "@/lib/supabase/client"');
    expect(dashboardDataHook).toContain("Dashboard realtime unavailable");
  });
});
