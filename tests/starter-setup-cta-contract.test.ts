import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("starter setup CTA contract", () => {
  it("keeps group guidance on the resource that actually needs attention", () => {
    const source = readFileSync("src/components/groups/GroupsDashboard.tsx", "utf8");

    expect(source).toContain("const guidedSetupAction = useMemo");
    expect(source).toContain("href: `/app/${academyId}/coaches`");
    expect(source).toContain("href: `/app/${academyId}/athletes`");
    expect(source).toContain('href: "#groups-list"');
    expect(source).not.toContain("Revisar {pluralizeFirstWord(specialization.labels.classLabel).toLowerCase()}");
  });

  it("keeps class guidance contextual instead of routing every issue to groups", () => {
    const source = readFileSync("src/components/classes/ClassesDashboard.tsx", "utf8");

    expect(source).toContain("const guidedSetupAction = useMemo");
    expect(source).toContain("href: `/app/${academyId}/coaches`");
    expect(source).toContain("href: `/app/${academyId}/groups`");
    expect(source).toContain("href: `/app/${academyId}/classes/${firstReadyClass.id}/recurring`");
    expect(source).toContain('label: "Generar sesiones"');
    expect(source).toContain('href: "#classes-list"');
    expect(source).not.toContain("Revisar {specialization.labels.groupLabel.toLowerCase()}s");
  });

  it("does not pass server event handlers into the recurring sessions client", () => {
    const source = readFileSync("src/app/app/[academyId]/classes/[classId]/recurring/page.tsx", "utf8");

    expect(source).toContain("<RecurringSessionsManager");
    expect(source).not.toContain("onSettingsUpdated={() =>");
  });

  it("pluralizes multi-word academy labels without corrupting the second word", () => {
    const source = readFileSync("src/components/dashboard/DashboardSections.tsx", "utf8");
    const dashboardSource = readFileSync("src/components/dashboard/DashboardPage.tsx", "utf8");
    const technicalSource = readFileSync("src/components/dashboard/TechnicalOverviewWidget.tsx", "utf8");
    const quickActionsSource = readFileSync("src/components/dashboard/QuickActionsWidget.tsx", "utf8");
    const quickReportsSource = readFileSync("src/components/dashboard/QuickReportsWidget.tsx", "utf8");

    expect(source).toContain("pluralizeFirstWord(labels.groupLabel)");
    expect(source).toContain("pluralizeFirstWord(labels.classLabel)");
    expect(source).not.toContain("labels.groupLabel.toLowerCase()}s");
    expect(source).not.toContain("labels.classLabel.toLowerCase()}s");
    expect(dashboardSource).toContain("pluralizeFirstWord(labels.groupLabel)");
    expect(dashboardSource).toContain("pluralizeFirstWord(labels.classLabel)");
    expect(dashboardSource).not.toContain("labels.groupLabel.toLowerCase()}s");
    expect(dashboardSource).not.toContain("labels.classLabel.toLowerCase()}s");
    expect(technicalSource).toContain("pluralizeFirstWord(specialization.labels.groupLabel)");
    expect(technicalSource).toContain("pluralizeFirstWord(specialization.labels.classLabel)");
    expect(quickActionsSource).toContain("pluralizeFirstWord(specialization.labels.classLabel)");
    expect(quickReportsSource).toContain("pluralizeFirstWord(specialization.labels.classLabel)");
  });
});
