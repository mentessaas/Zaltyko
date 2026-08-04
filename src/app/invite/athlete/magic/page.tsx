import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { athleteInvitations, academies } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { markInvitationOpened } from "@/lib/athletes/magic-link-invite-service";
import { InvitationPageShell } from "@/components/invitations/InvitationPageShell";
import { AthleteMagicLinkCompleteForm } from "@/components/invitations/AthleteMagicLinkCompleteForm";

export const dynamic = "force-dynamic";

interface MagicPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AthleteMagicLinkPage({ searchParams }: MagicPageProps) {
  const params = await searchParams;
  const state = typeof params.state === "string" ? params.state : null;
  if (!state) {
    redirect("/invite/athlete?error=missing_state");
  }

  const [invitation] = await db
    .select({
      id: athleteInvitations.id,
      academyId: athleteInvitations.academyId,
      tenantId: athleteInvitations.tenantId,
      email: athleteInvitations.email,
      status: athleteInvitations.status,
      expiresAt: athleteInvitations.expiresAt,
      customMessage: athleteInvitations.customMessage,
      supabaseUserId: athleteInvitations.supabaseUserId,
      academyName: academies.name,
    })
    .from(athleteInvitations)
    .innerJoin(academies, eq(athleteInvitations.academyId, academies.id))
    .where(eq(athleteInvitations.stateToken, state))
    .limit(1);

  if (!invitation) {
    redirect("/invite/athlete?error=not_found");
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Si el magic link NO se abrió todavía (el usuario llegó por URL directa),
  // redirigir al login indicándole que abra el correo.
  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(`/invite/athlete/magic?state=${state}`)}`);
  }

  // Vincular supabase user_id con la invitación (idempotente).
  // Si el email no coincide, NO marcamos como opened — dejamos que el usuario
  // vea la pantalla de error y contacte al owner.
  if (
    invitation.status === "pending" &&
    user.email?.toLowerCase() === invitation.email.toLowerCase()
  ) {
    await markInvitationOpened(invitation.id, user.id);
  }

  const emailMismatch =
    user.email?.toLowerCase() !== invitation.email.toLowerCase();
  const expired = invitation.expiresAt < new Date() && invitation.status !== "profile_complete";
  const alreadyComplete = invitation.status === "profile_complete";

  if (alreadyComplete) {
    redirect("/my-dashboard/athlete?welcome=1");
  }

  return (
    <InvitationPageShell
      eyebrow="Confirmar invitación"
      title={`Completa tu perfil para ${invitation.academyName}`}
      description="Estás a un paso de acceder a tu calendario, evaluaciones y avisos del club. Estos datos sólo los verá tu academia."
      highlights={[
        "Tu nombre y fecha de nacimiento aparecen en los listados del staff.",
        "Tu nivel y aparato principal se usan para ubicarte en los grupos correctos.",
        "Tu email ya quedó verificado al abrir este enlace.",
      ]}
      form={
        <AthleteMagicLinkCompleteForm
          stateToken={state}
          expectedEmail={invitation.email}
          authenticatedEmail={user.email ?? null}
          emailMismatch={emailMismatch}
          expired={expired}
          customMessage={invitation.customMessage}
        />
      }
    />
  );
}