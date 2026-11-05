import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { TeamInvitationAcceptance } from "./TeamInvitationAcceptance";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Invitación de equipo | Zaltyko",
  description: "Revisa una invitación antes de aceptar el acceso a una academia.",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function TeamInvitationAcceptancePage() {
  if (process.env.ZALTYKO_TEAM_ACCESS_ENABLED !== "true") notFound();
  return <TeamInvitationAcceptance />;
}
