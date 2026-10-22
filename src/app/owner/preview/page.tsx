import { notFound } from "next/navigation";

import { OwnerDashboardView } from "@/components/owner-dashboard/OwnerDashboardView";
import { ownerDashboardPreviewBundle } from "@/modules/owner-dashboard/fixtures/preview";
import {
  ownerDashboardCapacityPreview,
  ownerDashboardCohortsPreview,
} from "@/modules/owner-dashboard/fixtures/preview-operational-evidence";

export default function OwnerDashboardPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <OwnerDashboardView
      bundle={ownerDashboardPreviewBundle}
      capacity={ownerDashboardCapacityPreview}
      cohorts={ownerDashboardCohortsPreview}
      dashboardFilters={{
        programs: [
          {
            id: "10000000-0000-0000-0000-000000000701",
            name: "Gimnasia artística",
          },
        ],
        groups: [
          {
            id: "10000000-0000-0000-0000-000000000798",
            name: "Iniciación",
            programId: "10000000-0000-0000-0000-000000000701",
          },
        ],
        selectedProgramId: null,
        selectedGroupId: null,
      }}
      preview
    />
  );
}
