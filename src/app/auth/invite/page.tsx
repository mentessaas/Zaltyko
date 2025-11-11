import type { Metadata } from "next";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { invitations } from "@/db/schema";
import AcceptInvitationForm from "@/components/AcceptInvitationForm";

interface InvitePageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export const metadata: Metadata = {
  title: "Aceptar invitación",
  description: "Completa tu registro en GymnaSaaS.",
};

export default async function InvitePage({ searchParams }: InvitePageProps) {
  const token = typeof searchParams.token === "string" ? searchParams.token : undefined;

  if (!token) {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-4 text-center">
        <h1 className="text-3xl font-semibold">Invitación no válida</h1>
        <p className="text-muted-foreground">
          Falta el token de invitación. Revisa el enlace que recibiste o solicita uno nuevo.
        </p>
      </div>
    );
  }

  const [invitation] = await db
    .select({
      email: invitations.email,
      role: invitations.role,
      status: invitations.status,
      expiresAt: invitations.expiresAt,
    })
    .from(invitations)
    .where(eq(invitations.token, token))
    .limit(1);

  if (!invitation) {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-4 text-center">
        <h1 className="text-3xl font-semibold">Invitación no encontrada</h1>
        <p className="text-muted-foreground">
          El enlace pudo expirar o ya fue utilizado. Pide a tu administrador que te envíe una nueva invitación.
        </p>
      </div>
    );
  }

  if (invitation.status !== "pending") {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-4 text-center">
        <h1 className="text-3xl font-semibold">Invitación utilizada</h1>
        <p className="text-muted-foreground">
          Esta invitación ya fue aceptada. Si no recuerdas tu contraseña, utiliza la opción de recuperación.
        </p>
      </div>
    );
  }

  if (invitation.expiresAt && invitation.expiresAt < new Date()) {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-4 text-center">
        <h1 className="text-3xl font-semibold">Invitación expirada</h1>
        <p className="text-muted-foreground">
          Han pasado más de 7 días desde el envío. Solicita una nueva invitación para continuar.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-6 px-4 py-12">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold">Únete a GymnaSaaS</h1>
        <p className="text-muted-foreground">
          Completa tu registro para acceder al panel con el rol de <strong>{invitation.role}</strong>.
        </p>
      </div>

      <div className="rounded-lg border bg-card p-6 shadow">
        <AcceptInvitationForm token={token} email={invitation.email} role={invitation.role} />
      </div>
    </div>
  );
}


