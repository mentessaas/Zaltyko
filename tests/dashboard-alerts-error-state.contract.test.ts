import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("dashboard alerts resilience", () => {
  it("shows a retryable state when alert sources fail", () => {
    const widget = readFileSync("src/components/dashboard/AlertsWidget.tsx", "utf8");
    const page = readFileSync("src/components/dashboard/DashboardPage.tsx", "utf8");
    expect(widget).toContain('role="alert"');
    expect(widget).toContain("onRetry");
    expect(page).toContain("setAlertsError");
    expect(page).toContain("onRetry={() => void loadAlerts()}");
  });
});
