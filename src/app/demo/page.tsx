import type { Metadata } from "next";

import { DemoIntro } from "@/components/demo/DemoIntro";
import { DemoStepper } from "@/components/demo/DemoStepper";
import { OwnerEssentialDashboard } from "@/components/owner-dashboard/OwnerEssentialDashboard";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import {
  DEMO_ORGANIZATION_ID,
  DEMO_ORGANIZATION_NAME,
  demoAttentionItems,
  demoOperationalSummary,
  demoOwnerScope,
  demoTodaySessions,
} from "@/modules/demo/demo-fixtures";

// La fecha de hoy decide qué sesiones salen en «Hoy»: nada se prerenderiza.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Resumen · Demo de Zaltyko" };

export default function DemoSummaryPage() {
  const now = new Date();
  return (
    <OwnerWorkspacePageShell
      demo
      organizationId={DEMO_ORGANIZATION_ID}
      organizationName={DEMO_ORGANIZATION_NAME}
      locationId={null}
    >
      <DemoIntro />
      <OwnerEssentialDashboard
        scope={demoOwnerScope()}
        operationalSummary={demoOperationalSummary(now)}
        todaySessions={demoTodaySessions(now)}
        attentionItems={demoAttentionItems()}
        setupProgress={null}
        viewerName={null}
      />
      <DemoStepper current="resumen" />
    </OwnerWorkspacePageShell>
  );
}
