import type { Metadata } from "next";

import { DemoStepper } from "@/components/demo/DemoStepper";
import { OwnerAttendanceManager } from "@/components/owner-dashboard/OwnerAttendanceManager";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import {
  DEMO_ORGANIZATION_ID,
  DEMO_ORGANIZATION_NAME,
  demoAttendanceView,
} from "@/modules/demo/demo-fixtures";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Asistencia · Demo de Zaltyko" };

export default function DemoAttendancePage() {
  const view = demoAttendanceView(new Date());
  return (
    <OwnerWorkspacePageShell
      demo
      organizationId={DEMO_ORGANIZATION_ID}
      organizationName={DEMO_ORGANIZATION_NAME}
      locationId={null}
    >
      <OwnerAttendanceManager
        coachMode={false}
        organizationId={view.organizationId}
        locationId={view.locationId}
        sessions={view.sessions}
        initialSessionId={view.initialSessionId}
        initialNextCursor={null}
        selectedSession={view.selectedSession}
        progressAvailable={false}
        coachAssignmentAvailable={false}
        sessionPlansAvailable={false}
      />
      <DemoStepper current="asistencia" />
    </OwnerWorkspacePageShell>
  );
}
