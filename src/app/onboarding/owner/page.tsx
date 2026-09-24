import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { OwnerClaimCard } from "@/components/onboarding/OwnerClaimCard";
import { OwnerOnboardingForm } from "@/components/onboarding/OwnerOnboardingForm";
import { createClient } from "@/lib/supabase/server";
import { resolveUserHome } from "@/lib/auth/resolve-user-home";
import { findClaimableAcademyByEmail } from "@/lib/auth/claim-academy";

export const dynamic = "force-dynamic";

/**
 * Onboarding owner — gate Supabase + resolveUserHome + claim-academy check.
 *
 * Si el email del usuario autenticado matchea `academies.contactEmail` de
 * una academia registrada, renderiza `<OwnerClaimCard />` (rama claim).
 * Si no hay match, renderiza `<OwnerOnboardingForm />` (rama
 * create-from-scratch). El usuario elige; no es un redirect implícito —
 * solo cambia qué componente se renderiza.
 *
 * El endpoint POST `/api/onboarding/owner/claim` re-verifica el match
 * server-side (defensa en profundidad) y rechaza con 403
 * `CLAIM_EMAIL_MISMATCH` si la URL/page fue manipulada.
 */
export default async function OwnerOnboardingPage() {
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

  if (home.destination !== "owner_setup") {
    redirect(home.redirectUrl);
  }

  const claimable = await findClaimableAcademyByEmail({
    email: user.email,
  });

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-4 py-12">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-primary">Primer paso: crear tu espacio de trabajo</p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {claimable ? "Confirma tu academia" : "Crea tu primera academia"}
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          {claimable
            ? "Detectamos una academia registrada a tu nombre. Confirma para entrar — no te pediremos teléfono ni datos adicionales."
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
          <span className="mt-0.5 block text-xs opacity-80">Después, desde el panel</span>
        </li>
      </ol>

      <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        {claimable ? (
          <OwnerClaimCard academyId={claimable.id} academyName={claimable.name} />
        ) : (
          <OwnerOnboardingForm />
        )}
      </div>
    </div>
  );
}
