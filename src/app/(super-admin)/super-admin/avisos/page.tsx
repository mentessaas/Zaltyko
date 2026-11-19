import type { Metadata } from "next";

import { SuperAdminContentNotices } from "../components/SuperAdminContentNotices";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Avisos | Super admin",
  robots: { index: false, follow: false },
};

/** El layout exige super_admin; la API vuelve a comprobarlo con withSuperAdmin. */
export default function SuperAdminContentNoticesPage() {
  return <SuperAdminContentNotices />;
}
