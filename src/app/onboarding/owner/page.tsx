import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { OwnerClaimCard } from "@/components/onboarding/OwnerClaimCard";
import { OwnerOnboardingForm } from "@/components/onboarding/OwnerOnboardingForm";
import { createClient } from "@/lib/supabase/server";
import { resolveUserHome } from "@/lib/auth/resolve-user-home";
import { findClaimableAcademyByEmail } from "@/lib/onboarding/owner-claim";

export const dynamic = "force-dynamic";

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

  // Gate D-006 v0: si el email del usuario matchea el `contactEmail` de una
  // academia pre-registrada (seed list), el happy path es reclamar con un click
  // — no pedimos CP/teléfono porque el seed ya los tiene y la verificación de
  // ownership es el match de email. Ver SPEC_ONBOARDING_ZALTYKO_WEB.md §Gates.
  const claimable = await findClaimableAcademyByEmail(user.email);

  const metadata = user.user_metadata as { full_name?: string; name?: string } | null;
  const suggestedFullName =
    metadata?.full_name?.trim() || metadata?.name?.trim() || "";

  if (claimable) {
    return (
      <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-4 py-12">
        <div className="space-y-3">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">
            Configuración inicial
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Bienvenida, {claimable.name}
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground">
            Detectamos tu academia con el email {user.email}. Confirma para entrar
            a tu espacio de trabajo.
          </p>
        </div>

        <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">
          <OwnerClaimCard
            academyId={claimable.id}
            academyName={claimable.name}
            city={claimable.city}
            region={claimable.region}
            country={claimable.country}
            contactPhone={claimable.contactPhone}
            suggestedFullName={suggestedFullName}
          />
        </div>
      </div>
    );
  }

  // Fallback: no hay match en el seed. Pedimos CP/teléfono para verificación
  // manual antes de crear la academia (escalación a review si no se puede
  // verificar al instante). Mantener TTFAA del happy path <10 min: este
  // camino es explícitamente el lento.
  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-4 py-12">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-primary">
          Configuración inicial
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Crea tu primera academia
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          No detectamos tu academia en nuestra lista de pre-registro. Te pedimos
          un teléfono de contacto para verificar la propiedad y dejar lista tu
          cuenta. Tu equipo y tus atletas entrarán más adelante mediante
          invitación, no con registro libre.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        <OwnerOnboardingForm
          suggestedFullName={suggestedFullName}
          requireContactPhone
        />
      </div>
    </div>
  );
}
