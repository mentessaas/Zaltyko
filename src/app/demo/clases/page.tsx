import type { Metadata } from "next";

import { DemoStepper } from "@/components/demo/DemoStepper";
import { OwnerClassesManager } from "@/components/owner-dashboard/OwnerClassesManager";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import {
  DEMO_ORGANIZATION_ID,
  DEMO_ORGANIZATION_NAME,
  demoClassesBundle,
} from "@/modules/demo/demo-fixtures";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Clases · Demo de Zaltyko" };

export default function DemoClassesPage() {
  return (
    <OwnerWorkspacePageShell
      demo
      organizationId={DEMO_ORGANIZATION_ID}
      organizationName={DEMO_ORGANIZATION_NAME}
      locationId={null}
    >
      <OwnerClassesManager bundle={demoClassesBundle(new Date())} navigationLocationId={null} coachAssignment={null} />
      <DemoStepper current="clases" />
    </OwnerWorkspacePageShell>
  );
}
