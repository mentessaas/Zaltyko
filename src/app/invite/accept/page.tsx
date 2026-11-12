import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { invitations } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import AcceptInvitationForm from "@/components/AcceptInvitationForm";
import { InvitationPageShell } from "@/components/invitations/InvitationPageShell";

interface AcceptPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AcceptInvitationPage({ searchParams }: AcceptPageProps) {
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

  if (!invitation || invitation.status !== "pending" || (invitation.expiresAt && invitation.expiresAt < new Date())) {
    notFound();
  }

  // Verificar si el usuario ya tiene sesión
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  const userEmail = user?.email?.toLowerCase() ?? null;
  const isSameEmail = userEmail === invitation.email.toLowerCase();
  const isAuthenticated = Boolean(user);

  return (
    <InvitationPageShell
      eyebrow="Primeros pasos recomendados"
      title={`Únete como ${invitation.role === "coach" ? "entrenador" : "miembro"}`}
      description="Al aceptar tendrás acceso a tus grupos, atletas y calendario asignado. Completa el registro para empezar."
      highlights={[
        "Estudia los grupos que se te asignaron.",
        "Registra asistencia en tu próxima clase.",
        "Comparte comentarios técnicos con los atletas.",
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
