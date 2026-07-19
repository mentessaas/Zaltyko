import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { invitations } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import AcceptInvitationForm from "@/components/AcceptInvitationForm";
import { InvitationPageShell } from "@/components/invitations/InvitationPageShell";

interface AthleteInviteProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AthleteInvitationPage({ searchParams }: AthleteInviteProps) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : null;
  if (!token) {
    notFound();
  }

  const [invitation] = await db
    .select({
      email: invitations.email,
      role: invitations.role,
      status: invitations.status,
      expiresAt: invitations.expiresAt,
      academyIds: invitations.academyIds,
    })
    .from(invitations)
    .where(eq(invitations.token, token))
    .limit(1);

  if (
    !invitation ||
    invitation.role !== "athlete" ||
    invitation.status !== "pending" ||
    (invitation.expiresAt && invitation.expiresAt < new Date())
  ) {
    notFound();
  }

  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  const userEmail = user?.email?.toLowerCase() ?? null;
  const isSameEmail = userEmail === invitation.email.toLowerCase();
  const isAuthenticated = Boolean(user);

  return (
    <InvitationPageShell
      eyebrow="Invitación para atletas"
      title="Bienvenido a tu espacio de atleta"
      description="Tu academia te ha invitado a unirte a Zaltyko para acceder a tu perfil, calendario de clases y seguimiento de tu progreso."
      highlights={[
        "Tendrás a mano tu perfil, categoría y calendario de entrenamientos.",
        "Podrás consultar evaluaciones, eventos y avisos importantes del club.",
        "Tu experiencia queda separada del shell administrativo para que todo sea más claro.",
      ]}
      form={
        <AcceptInvitationForm
          token={token}
          email={invitation.email}
          role={invitation.role}
          isAuthenticated={isAuthenticated}
          isSameEmail={isSameEmail}
          userEmail={userEmail}
        />
      }
    />
  );
}
