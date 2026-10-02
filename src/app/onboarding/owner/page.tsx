import Link from "next/link";
import { sql } from "drizzle-orm";
import { rows } from "@/lib/directory/service";
import { flag } from "@/lib/directory/contracts";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { OwnerClaimCard } from "@/components/onboarding/OwnerClaimCard";
import { OwnerOnboardingForm } from "@/components/onboarding/OwnerOnboardingForm";
import { createClient } from "@/lib/supabase/server";
import { resolveUserHome } from "@/lib/auth/resolve-user-home";
import { findClaimableAcademyByEmail } from "@/lib/auth/claim-academy";

export const dynamic = "force-dynamic";

export default async function OwnerOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ directoryEntryId?: string }>;
}) {
  const { directoryEntryId } = await searchParams;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const home = await resolveUserHome({
    userId: user.id,
    email: user.email,
  });

  let initialAcademy:
    | { name: string; countryCode: string; region?: string; city?: string }
    | undefined;
  if (directoryEntryId) {
    if (!flag("claims") || !/^[a-f0-9-]{36}$/i.test(directoryEntryId))
      redirect("/directorio/mis-fichas");
    const entry = (
      await rows(
        sql`SELECT d.academy_id, d.data FROM directory_entries d JOIN directory_grants g ON g.entry_id=d.id WHERE d.id=${directoryEntryId}::uuid AND g.user_id=${user.id}::uuid AND d.kind='academy' AND d.merged_into IS NULL`
      )
    )[0];
    if (!entry) redirect("/directorio/mis-fichas");
    const data = entry.data as {
      name: string;
      countryCode: string;
      region?: string;
      city?: string;
    };
    initialAcademy = {
      name: data.name,
      countryCode: data.countryCode.toLowerCase(),
      region: data.region,
      city: data.city,
    };
    if (home.destination !== "owner_setup")
      return (
        <main className="mx-auto max-w-2xl space-y-5 px-4 py-12">
          <h1 className="text-2xl font-bold">
            Activar la gestión de tu academia
          </h1>
          <p>
            {entry.academy_id
              ? "La ficha ya está vinculada. Los permisos del espacio operativo se gestionan por separado."
              : "Tu cuenta ya tiene un destino y permisos. Para vincular un espacio existente o habilitar el alta de propietario, solicita asistencia."}
          </p>
          <Link href="/contact" className="underline">
            Solicitar asistencia
          </Link>
          <Link href="/directorio/mis-fichas" className="block underline">
            Volver a Mis fichas
          </Link>
        </main>
      );
  }
  if (home.destination !== "owner_setup") {
    redirect(home.redirectUrl);
  }

  const claimable = await findClaimableAcademyByEmail({
    email: user.email,
  });

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-4 py-12">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-primary">
          Primer paso: crear tu espacio de trabajo
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {claimable
            ? "Confirma tu academia"
            : flag("catalog") && !directoryEntryId
              ? "Encuentra o crea tu academia"
              : "Crea tu primera academia"}
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          {claimable
            ? "Detectamos una academia registrada a tu nombre. Confirma para entrar — no te pediremos teléfono ni datos adicionales."
            : flag("catalog") && !directoryEntryId
              ? "Tu cuenta ya está creada. Busca si tu academia tiene ficha y solicita gestionarla; si no corresponde ninguna, continúa con un espacio nuevo. Reclamar una ficha es gratis y requiere revisión."
              : "Tu cuenta y tu academia son pasos distintos: aquí crearás el espacio de trabajo de Zaltyko. Después podrás añadir grupos, clases, entrenadores y atletas desde el panel."}
        </p>
      </div>

      <ol
        aria-label="Progreso de configuración"
        className="grid gap-2 text-sm sm:grid-cols-3"
        data-testid="owner-onboarding-progress"
      >
        <li className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-800 dark:text-emerald-200">
          <span className="font-semibold">1. Cuenta personal</span>
          <span className="mt-0.5 block text-xs opacity-80">Completada</span>
        </li>
        <li className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-primary">
          <span className="font-semibold">2. Tu academia</span>
          <span className="mt-0.5 block text-xs opacity-80">Ahora</span>
        </li>
        <li className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-muted-foreground">
          <span className="font-semibold">3. Configuración</span>
          <span className="mt-0.5 block text-xs opacity-80">
            Después, desde el panel
          </span>
        </li>
      </ol>

      <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        {claimable ? (
          <OwnerClaimCard
            academyId={claimable.id}
            academyName={claimable.name}
          />
        ) : (
          <OwnerOnboardingForm
            directoryEntryId={directoryEntryId}
            initialAcademy={initialAcademy}
            directoryDiscoveryEnabled={flag("catalog")}
            directoryClaimsEnabled={flag("claims")}
          />
        )}
      </div>
    </div>
  );
}
