import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { invitations } from "@/db/schema";
import AcceptInvitationForm from "@/components/AcceptInvitationForm";

interface ParentInviteProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function ParentInvitationPage({ searchParams }: ParentInviteProps) {
  const token = typeof searchParams.token === "string" ? searchParams.token : null;
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

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-12">
      <div className="rounded-xl border bg-card/80 p-6 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Invitación para padres</p>
        <h1 className="mt-2 text-3xl font-semibold">Consulta la información de tus hijos en tiempo real</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Registra tu cuenta para ver horarios, asistencia y próximas cuotas desde cualquier dispositivo.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-dashed p-4 text-sm">
            <p className="font-semibold text-foreground">Qué verás al entrar</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Grupo y entrenador asignado.</li>
              <li>Próxima clase y estado de asistencia.</li>
              <li>Mensajes importantes del club.</li>
            </ul>
          </div>
          <div className="rounded-lg border border-dashed p-4 text-sm">
            <p className="font-semibold text-foreground">Después de registrarte</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Actualiza datos de contacto.</li>
              <li>Configura métodos de pago si están disponibles.</li>
              <li>Descarga la app para recibir notificaciones.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow">
        <AcceptInvitationForm token={token} email={invitation.email} role={invitation.role} />
      </div>
    </div>
  );
}

