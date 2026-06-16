import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { invitations } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import AcceptInvitationForm from "@/components/AcceptInvitationForm";
import { InvitationPageShell } from "@/components/invitations/InvitationPageShell";

interface ParentInviteProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ParentInvitationPage({ searchParams }: ParentInviteProps) {
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
    invitation.role !== "parent" ||
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
      eyebrow="Invitación para tutores"
      title="Consulta la información de tus hijos en tiempo real"
      description="Registra tu cuenta para ver horarios, asistencia y próximas cuotas desde cualquier dispositivo."
      highlights={[
        "Verás el grupo, el entrenador asignado y la próxima clase disponible.",
        "Podrás seguir asistencia, avisos importantes y movimientos relevantes de tus hijos.",
        "Después podrás actualizar tus datos de contacto y, si aplica, gestionar pagos.",
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
