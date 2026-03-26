import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { invitations } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import AcceptInvitationForm from "@/components/AcceptInvitationForm";

interface AthleteInviteProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function AthleteInvitationPage({ searchParams }: AthleteInviteProps) {
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
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 px-4 py-12">
      <div className="rounded-xl border bg-card/80 p-6 shadow-sm">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Invitación para atleta</p>
        <h1 className="mt-2 text-3xl font-semibold">Bienvenido/a gimnasta</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Tu academia te ha invitado a unirte a Zaltyko. Crea tu cuenta para acceder a tu perfil,
          calendario de clases y seguimiento de tu progreso.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-dashed p-4 text-sm">
            <p className="font-semibold text-foreground">Qué tendrás disponible</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Tu perfil de gimnasta y estadísticas.</li>
              <li>Calendario de clases y eventos.</li>
              <li>Historial de evaluaciones técnicas.</li>
            </ul>
          </div>
          <div className="rounded-lg border border-dashed p-4 text-sm">
            <p className="font-semibold text-foreground">Después de registrarte</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
              <li>Revisa tu perfil y categoría.</li>
              <li>Consulta tu calendario de entrenos.</li>
              <li>Comparte tu progreso con tu familia.</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow">
        <AcceptInvitationForm
          token={token}
          email={invitation.email}
          role={invitation.role}
          isAuthenticated={isAuthenticated}
          isSameEmail={isSameEmail}
          userEmail={userEmail}
        />
      </div>
    </div>
  );
}
