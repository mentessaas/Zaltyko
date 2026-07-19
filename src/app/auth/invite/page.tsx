import type { Metadata } from "next";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { invitations } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import AcceptInvitationForm from "@/components/AcceptInvitationForm";
import { InvitationPageShell } from "@/components/invitations/InvitationPageShell";

interface InvitePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export const metadata: Metadata = {
  title: "Aceptar invitación",
  description: "Completa tu registro en Zaltyko.",
};

export default async function InvitePage({ searchParams }: InvitePageProps) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : undefined;

  if (!token) {
    return (
      <InvitationPageShell
        eyebrow="Invitación"
        title="Invitación no válida"
        description="Falta el token de invitación. Revisa el enlace que recibiste o solicita uno nuevo."
        highlights={[
          "Las invitaciones deben abrirse desde el enlace original recibido por correo.",
          "Si el enlace se cortó o expiró, tu academia puede enviarte uno nuevo.",
        ]}
        form={<p className="text-sm leading-6 text-muted-foreground">No pudimos validar esta invitación.</p>}
      />
    );
  }

  const [invitation] = await db
    .select({
      id: invitations.id,
      email: invitations.email,
      role: invitations.role,
      status: invitations.status,
      expiresAt: invitations.expiresAt,
      academyIds: invitations.academyIds,
      defaultAcademyId: invitations.defaultAcademyId,
    })
    .from(invitations)
    .where(eq(invitations.token, token))
    .limit(1);

  if (!invitation) {
    return (
      <InvitationPageShell
        eyebrow="Invitación"
        title="Invitación no encontrada"
        description="El enlace pudo expirar o ya fue utilizado. Pide a tu administrador que te envíe una nueva invitación."
        highlights={[
          "Cada invitación está asociada a un correo y a un tiempo de validez.",
          "Si el enlace ya fue usado, tendrás que entrar con la cuenta ya creada.",
        ]}
        form={<p className="text-sm leading-6 text-muted-foreground">No encontramos una invitación activa con ese enlace.</p>}
      />
    );
  }

  if (invitation.status !== "pending") {
    return (
      <InvitationPageShell
        eyebrow="Invitación"
        title="Invitación ya utilizada"
        description="Esta invitación ya fue aceptada. Si no recuerdas tu contraseña, utiliza la opción de recuperación."
        highlights={[
          "La cuenta ya debería existir con el correo invitado.",
          "Puedes volver a entrar desde el acceso principal.",
        ]}
        form={<p className="text-sm leading-6 text-muted-foreground">Esta invitación ya no puede volver a aceptarse.</p>}
      />
    );
  }

  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    return (
      <InvitationPageShell
        eyebrow="Invitación"
        title="Invitación expirada"
        description="Han pasado más de 7 días desde el envío. Solicita una nueva invitación para continuar."
        highlights={[
          "Las invitaciones tienen vencimiento para evitar accesos huérfanos o enlaces viejos.",
          "Tu academia puede reenviarte una nueva en segundos.",
        ]}
        form={<p className="text-sm leading-6 text-muted-foreground">Este enlace ya caducó y no puede reutilizarse.</p>}
      />
    );
  }

  // Verificar si el usuario actual ya tiene sesión con el mismo email
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userEmail = user?.email?.toLowerCase();
  const isSameEmail = userEmail === invitation.email.toLowerCase();
  const isAuthenticated = Boolean(user);

  return (
    <InvitationPageShell
      eyebrow="Invitación"
      title="Únete a Zaltyko"
      description={
        <>
          {isAuthenticated && isSameEmail
            ? <>Te están invitando como <strong>{invitation.role}</strong>. Confirma para unirte.</>
            : <>Completa tu registro para acceder al panel con el rol de <strong>{invitation.role}</strong>.</>}
        </>
      }
      highlights={[
        "El acceso final depende de tu rol y de la academia a la que te invitaron.",
        "Si ya tienes sesión con el mismo correo, puedes aceptar la invitación en un paso.",
        "Si es tu primera vez, aquí mismo creas la cuenta y quedas vinculado al tenant correcto.",
      ]}
      form={
        <AcceptInvitationForm
          token={token}
          email={invitation.email}
          role={invitation.role}
          isAuthenticated={isAuthenticated}
          isSameEmail={isSameEmail}
          userEmail={userEmail ?? null}
        />
      }
    />
  );
}

