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
      preview
    />
  );
}
