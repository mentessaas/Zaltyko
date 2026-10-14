import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { AcademyTargetProfileForm } from "@/components/owner-dashboard/AcademyTargetProfileForm";
import { db } from "@/db";
import { organizations } from "@/db/zaltyko-schema";
import { eq } from "drizzle-orm";
import { createClient } from "@/lib/supabase/server";
import { getAcademyTargetProfile } from "@/modules/health-score/application/academy-target-profile";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const dynamic = "force-dynamic";

export default async function AcademyHealthScoreSetupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/owner/health-score/setup");

  const query = await searchParams;
  const organizationId =
    typeof query.organizationId === "string" ? query.organizationId : undefined;
  let scope: Awaited<ReturnType<typeof resolveOwnerScope>>;
  try {
    scope = await resolveOwnerScope({ userId: user.id, organizationId });
  } catch (error) {
    if (
      error instanceof OperationalError &&
      ["FORBIDDEN", "LOCATION_SCOPE_DENIED"].includes(error.code)
    ) {
      notFound();
    }
    throw error;
  }
  if (!new Set(["owner", "admin"]).has(scope.member.role)) redirect("/owner");
  let profile: Awaited<ReturnType<typeof getAcademyTargetProfile>>;
  try {
    profile = await getAcademyTargetProfile(scope.organization.id);
  } catch (error) {
    if (error instanceof OperationalError && error.code === "INVALID_RELATION") {
      return (
        <main className="min-h-screen bg-[#F1F3EF] px-5 py-8 text-slate-950 sm:py-14">
          <div className="mx-auto max-w-3xl">
            <a
              href={`/owner?organizationId=${scope.organization.id}`}
              className="touch-target inline-flex items-center text-sm font-bold text-teal-900 underline underline-offset-4"
            >
              ← Volver a Mesa de dirección
            </a>
            <section
              role="alert"
              className="mt-8 border-l-4 border-amber-700 bg-white p-6 sm:p-8"
            >
              <h1 className="font-display text-2xl font-bold">
                No se pudieron validar las metas guardadas
              </h1>
              <p className="mt-3 leading-6 text-slate-700">
                No hemos rellenado ni cambiado ningún objetivo. El perfil
                contiene metas incompletas o una moneda que no coincide con su
                versión. Vuelve al panel o contacta con soporte para revisar la
                configuración.
              </p>
            </section>
          </div>
        </main>
      );
    }
    throw error;
  }
  const [organizationSettings] = await db
    .select({ currency: organizations.defaultCurrency })
    .from(organizations)
    .where(eq(organizations.id, scope.organization.id))
    .limit(1);
  return (
    <main className="min-h-screen bg-[#F1F3EF] px-5 py-8 text-slate-950 sm:py-14">
      <div className="mx-auto max-w-5xl">
        <a
          href={`/owner?organizationId=${scope.organization.id}`}
          className="touch-target inline-flex items-center text-sm font-bold text-teal-900 underline underline-offset-4"
        >
          ← Volver a Mesa de dirección
        </a>
        <header className="mt-8 grid gap-6 border-t-4 border-teal-800 bg-[#F8F8F4] p-6 sm:p-10 lg:grid-cols-[1fr_16rem] lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-800">
              Academy Health Score · configuración
            </p>
            <h1 className="mt-3 max-w-2xl font-display text-4xl font-bold tracking-[-0.04em] sm:text-5xl">
              Decide qué significa “saludable” para tu academia.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-700">
              Define cinco metas operativas. El score será una lectura
              explicable frente a esos objetivos propios, no un ranking ni una
              comparación con el mercado.
            </p>
          </div>
          <div className="border-l-2 border-teal-800 bg-white p-4">
            <span className="block text-xs font-bold uppercase tracking-wide text-slate-500">
              Academia
            </span>
            <span className="mt-1 block font-display text-lg font-bold">
              {scope.organization.name}
            </span>
            <span className="mt-3 block text-xs text-slate-600">
              Moneda base: {organizationSettings?.currency ?? "sin configurar"}
            </span>
          </div>
        </header>
        <section
          className="mt-8 bg-[#E7EAE3] p-5 sm:p-8"
          aria-label="Objetivos de salud"
        >
          <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold">
                Metas de {scope.organization.name}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Todos los valores se introducen como porcentajes del 1 % al 100
                %.
              </p>
            </div>
            {profile && (
              <span className="rounded-full border border-teal-900/30 bg-white px-3 py-1 text-xs font-bold text-teal-950">
                Versión {profile.version}
              </span>
            )}
          </div>
          <AcademyTargetProfileForm
            organizationId={scope.organization.id}
            profile={profile}
          />
        </section>
        <p className="mt-6 max-w-3xl text-xs leading-5 text-slate-500">
          Si más adelante se publica un benchmark con metodología y fuente
          verificables, se presentará como una referencia separada. Estas metas
          no reutilizan perfiles de prueba ni referencias externas.
        </p>
      </div>
    </main>
  );
}
