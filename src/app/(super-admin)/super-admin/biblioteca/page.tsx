import type { Metadata } from "next";

import { SuperAdminElementReview } from "../components/SuperAdminElementReview";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Biblioteca | Super admin",
  robots: { index: false, follow: false },
};

/** El layout exige super_admin; la API vuelve a comprobarlo con withSuperAdmin. */
export default function SuperAdminElementLibraryPage() {
  return <SuperAdminElementReview />;
}
