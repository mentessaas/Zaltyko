import { notFound } from "next/navigation";

import { InsightInbox } from "@/components/owner-dashboard/InsightInbox";
import type { InsightListBundle } from "@/modules/insights/application/insight-query";

export const dynamic = "force-dynamic";

const syntheticBundle: InsightListBundle = {
  organization: {
    id: "20000000-0000-0000-0000-000000000001",
    name: "Academia Horizonte — datos sintéticos",
    defaultCurrency: "EUR",
  },
  scope: {
    locationId: null,
    entityId: null,
    canViewOrganizationAggregate: true,
    locations: [
      {
        id: "20000000-0000-0000-0000-000000000011",
        name: "Sede Norte",
      },
      {
        id: "20000000-0000-0000-0000-000000000012",
        name: "Sede Sur",
      },
    ],
  },
  items: [
    {
      id: "20000000-0000-0000-0000-000000000901",
      organizationId: "20000000-0000-0000-0000-000000000001",
      locationId: null,
      ruleKey: "excess_demand",
      ruleName: "Demanda que supera la capacidad",
      ruleVersion: 1,
      status: "open",
      severity: "high",
      priorityScore: 87,
      title: "Hay demanda suficiente para estudiar otro grupo",
      detail:
        "El grupo de iniciación mantiene una ocupación del 92 % y hay 3 solicitudes elegibles en espera.",
      evidence: {
        fillRate: 0.92,
        eligibleWaitlist: 3,
        observedSessions: 4,
      },
      assumptions: [
        "Los escenarios del simulador (50/75/100 %) son sensibilidades no calibradas, no un benchmark.",
        "El importe solo se calcula con un precio mensual hipotético introducido por la persona usuaria; no garantiza ingresos.",
      ],
      ctaKey: "simulate_group",
      ctaPayload: {},
      estimatedValueMinMinor: 9000,
      estimatedValueMaxMinor: 18000,
      estimateCurrency: "EUR",
      entityType: "class_template",
      entityId: "20000000-0000-0000-0000-000000000801",
      detectedAt: "2026-10-06T08:00:00.000Z",
      lastSeenAt: "2026-10-06T10:30:00.000Z",
      snoozedUntil: null,
      version: 3,
    },
    {
      id: "20000000-0000-0000-0000-000000000902",
      organizationId: "20000000-0000-0000-0000-000000000001",
      locationId: null,
      ruleKey: "collection_followup",
      ruleName: "Seguimiento de cobros",
      ruleVersion: 1,
      status: "viewed",
      severity: "medium",
      priorityScore: 68,
      title: "Conviene revisar las obligaciones pendientes",
      detail:
        "El importe pendiente supera el umbral de seguimiento del cierre actual.",
      evidence: {
        outstanding_minor: 32000,
        overdue_obligations: 5,
        collection_rate: 0.88,
      },
      assumptions: [
        "El pendiente procede del ledger interno conciliable.",
        "No se muestra información personal de familias o atletas.",
      ],
      ctaKey: "review_collections",
      ctaPayload: {},
      estimatedValueMinMinor: null,
      estimatedValueMaxMinor: null,
      estimateCurrency: null,
      entityType: "organization",
      entityId: null,
      detectedAt: "2026-10-05T08:00:00.000Z",
      lastSeenAt: "2026-10-06T09:45:00.000Z",
      snoozedUntil: null,
      version: 2,
    },
  ],
  nextCursor: null,
};

export default function OwnerInsightsPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <InsightInbox bundle={syntheticBundle} />;
}
