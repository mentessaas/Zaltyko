import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const dashboard = read("src/components/dashboard/DashboardPage.tsx");
const kpi = read("src/components/dashboard/KPISection.tsx");
const pulse = read("src/components/dashboard/OperationsPulse.tsx");
const quickActions = read("src/components/dashboard/QuickActionsWidget.tsx");

describe("dashboard operational data cohesion", () => {
  it("comparte una única serie de tendencias entre KPIs y pulso operativo", () => {
    expect(dashboard).toContain("const loadKpiTrends = useCallback");
    expect(dashboard).toContain("trends={kpiTrends}");
    expect(dashboard).toContain("<OperationsPulse series={kpiTrends}");
    expect(kpi).not.toContain("/api/dashboard/kpi-trends");
    expect(pulse).not.toContain("/api/dashboard/kpi-trends");
  });

  it("lee el envelope estándar y normaliza clases antes de calcular recomendaciones", () => {
    expect(dashboard).toContain("includeAssignments=true");
    expect(dashboard).toContain("payload.data?.items");
    expect(dashboard).toContain("normalizeOperationalClasses");
    expect(dashboard).toContain("groupId ? [{ id: groupId }] : []");
    expect(dashboard).toContain("summarizeStarterClassSetup(specialization, normalizedClasses)");
    expect(dashboard).toContain("summarizeStarterGroupSetup(specialization, normalizedGroups)");
  });

  it("evita solicitar dos veces el resumen de acciones rápidas", () => {
    expect(dashboard).toContain("data={quickActionsData}");
    expect(dashboard).toContain("onRefresh={() => void loadQuickActions()}");
    expect(quickActions).not.toContain("/api/quick-actions/pending-today");
    expect(quickActions).not.toContain("fetchPendingData");
  });

  it("no deja el pulso operativo cargando indefinidamente", () => {
    expect(dashboard).toContain("const KPI_TRENDS_TIMEOUT_MS = 10_000;");
    expect(dashboard).toContain("const timeoutId = window.setTimeout");
    expect(dashboard).toContain("setKpiTrendsStatus(\"error\")");
    expect(dashboard).toContain("window.clearTimeout(timeoutId)");
  });
});
