import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { OwnerOnboardingForm } from "@/components/onboarding/OwnerOnboardingForm";
import { createClient } from "@/lib/supabase/server";
import { resolveUserHome } from "@/lib/auth/resolve-user-home";

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

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-4 py-12">
      <div className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wide text-primary">Configuración inicial</p>
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">
          Crea tu primera academia
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          Vamos a dejar lista tu cuenta para trabajar de inmediato. Tu equipo y tus atletas
          entrarán más adelante mediante invitación, no con registro libre.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">
        <OwnerOnboardingForm />
      </div>
    </div>
  );
}
