import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { invitations } from "@/db/schema";
import AcceptInvitationForm from "@/components/AcceptInvitationForm";

interface AcceptPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function AcceptInvitationPage({ searchParams }: AcceptPageProps) {
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

  if (!invitation || invitation.status !== "pending" || (invitation.expiresAt && invitation.expiresAt < new Date())) {
    notFound();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-12">
      <div className="rounded-xl border bg-card/80 p-6 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Invitación</p>
        <h1 className="mt-2 text-3xl font-semibold">Únete como {invitation.role === "coach" ? "entrenador" : "miembro"}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Al aceptar tendrás acceso a tus grupos, atletas y calendario asignado. Completa el registro para empezar.
        </p>
        <div className="mt-4 rounded-lg border border-dashed p-4 text-sm">
          <p className="font-semibold">Primeros pasos recomendados:</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>Estudia los grupos que se te asignaron.</li>
            <li>Registra asistencia en tu próxima clase.</li>
            <li>Comparte comentarios técnicos con los atletas.</li>
          </ul>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow">
        <AcceptInvitationForm token={token} email={invitation.email} role={invitation.role} />
      </div>
    </div>
  );
}

