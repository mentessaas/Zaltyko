import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FamilyInvitationAcceptance } from "@/components/family-portal/FamilyInvitationAcceptance";
import { isFamilyAccessAvailableForPage } from "@/modules/family-access/application/family-access-storage";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // La plantilla del layout raíz ya añade «| Zaltyko».
  title: "Invitación al portal de familias",
  description: "Revisa la invitación de tu academia antes de aceptarla.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Sin la bandera y el candidato instalado, la página no existe. El token nunca
 * llega al servidor: va en el fragmento.
 */
export default async function FamilyInvitationPage() {
  if (!(await isFamilyAccessAvailableForPage())) notFound();
  return <FamilyInvitationAcceptance />;
}
