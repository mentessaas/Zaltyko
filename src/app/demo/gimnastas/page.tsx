import type { Metadata } from "next";

import { DemoStepper } from "@/components/demo/DemoStepper";
import { OwnerAthleteIntakeWorkspace } from "@/components/owner-dashboard/OwnerAthleteIntakeWorkspace";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import { DEMO_ORGANIZATION_ID, DEMO_ORGANIZATION_NAME } from "@/modules/demo/demo-fixtures";

// La navegación del panel lee los parámetros de la URL: la página no se prerenderiza.
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Gimnastas · Demo de Zaltyko" };

export default function DemoAthletesPage() {
  return (
    <OwnerWorkspacePageShell
      demo
      organizationId={DEMO_ORGANIZATION_ID}
      organizationName={DEMO_ORGANIZATION_NAME}
      locationId={null}
    >
      <OwnerAthleteIntakeWorkspace organizationId={DEMO_ORGANIZATION_ID} organizationName={DEMO_ORGANIZATION_NAME} />
      <DemoStepper current="gimnastas" />
    </OwnerWorkspacePageShell>
  );
}
