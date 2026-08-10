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
        <p className="text-sm font-medium uppercase tracking-wide text-primary">Configuración inicial</p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          {claimable ? "Confirma tu academia" : "Crea tu primera academia"}
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          {claimable
            ? "Detectamos una academia registrada a tu nombre. Confirma para entrar — no te pediremos teléfono ni datos adicionales."
            : "Vamos a dejar lista tu cuenta para trabajar de inmediato. Tu equipo y tus atletas entrarán más adelante mediante invitación, no con registro libre."}
        </p>
      </div>

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