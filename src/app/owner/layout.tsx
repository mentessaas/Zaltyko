import type { Metadata } from "next";

import { OwnerWorkspaceNavigation } from "@/components/owner-dashboard/OwnerWorkspaceNavigation";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mesa de dirección",
  description: "Estado operativo, financiero y de crecimiento de la academia.",
  robots: { index: false, follow: false },
};

export default function OwnerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <OwnerWorkspaceNavigation />
      <div id="owner-workspace-content" tabIndex={-1}>
        {children}
      </div>
    </>
  );
}
