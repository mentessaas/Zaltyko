import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FamilyInvitationAcceptance } from "@/components/family-portal/FamilyInvitationAcceptance";
import { isFamilyAccessFlagOn } from "@/modules/family-access/domain/family-access-contract";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // La plantilla del layout raíz ya añade «| Zaltyko».
  title: "Invitación al portal de familias",
  description: "Revisa la invitación de tu academia antes de aceptarla.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** Sin la bandera, la página no existe. El token nunca llega al servidor: va en el fragmento. */
export default function FamilyInvitationPage() {
  if (!isFamilyAccessFlagOn()) notFound();
  return <FamilyInvitationAcceptance />;
}
