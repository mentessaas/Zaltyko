import { and, eq, inArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { organizationMembers } from "@/db/zaltyko-schema";
import { OwnerSetupForm } from "@/components/owner-dashboard/OwnerSetupForm";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import { PageHeader } from "@/components/ui/page-header";
import { isMissingCanonicalOwnerSchema } from "@/lib/auth/canonical-owner-schema";
import { findLegacyAcademyMemberships } from "@/lib/auth/legacy-academy-access";
import { resolveUserHome } from "@/lib/auth/resolve-user-home";
import { getOwnerContractualConsentRequirement } from "@/modules/organizations/application/owner-signup-consent";
import { createClient } from "@/lib/supabase/server";
import { coachHomeHref } from "@/modules/owner-dashboard/domain/coach-access";

export const dynamic = "force-dynamic";

export default async function OwnerSetupPage() {
  const supabase = await createClient(await cookies());
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) redirect("/auth/login?next=/owner/setup");

  const legacyMemberships = await findLegacyAcademyMemberships(user.id);
  if (legacyMemberships.length > 0) {
    const legacyHome = await resolveUserHome({
      userId: user.id,
      email: user.email,
    });
    // /app se retiró: una cuenta con academia antigua no tiene panel al que
    // volver, así que se queda aquí con el aviso (redirigir a /owner crearía un bucle).
    if (legacyHome.destination === "blocked") redirect(legacyHome.redirectUrl);

    return (
      <OwnerWorkspacePageShell
        member={null}
        organizationId={null}
        locationId={null}
      >
        <main className="grid min-h-screen place-items-center bg-z-canvas px-5 py-12 text-z-ink">
          <section className="w-full max-w-2xl rounded-xl border border-ochre-line border-t-[3px] border-t-ochre bg-white p-7 sm:p-10">
            {/* Cabecera compartida sin antetítulo; la regla de 3 px no se repite
                dentro de la tarjeta. */}
            <PageHeader title="No crearemos otra academia" className="border-b-0 pb-0" />
            <p className="mt-4 max-w-xl leading-7 text-z-soft" role="alert">
              Esta cuenta ya tiene una relación con una academia anterior. Para
              conservar sus datos, solicita la vinculación o revisión de esa
              academia antes de continuar.
            </p>
          </section>
        </main>
      </OwnerWorkspacePageShell>
    );
  }

  let existing: { organizationId: string } | undefined;
  let coachSeat: { organizationId: string } | undefined;
  try {
    [existing] = await db
      .select({ organizationId: organizationMembers.organizationId })
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.userId, user.id),
          eq(organizationMembers.status, "active"),
          inArray(organizationMembers.role, ["owner", "admin", "manager"])
        )
      )
      .limit(1);
    // P1 #8: a coach seat must never be offered the "create academy" form;
    // it lands on its only surface (Hoy + Pasar lista) instead.
    if (!existing) {
      [coachSeat] = await db
        .select({ organizationId: organizationMembers.organizationId })
        .from(organizationMembers)
        .where(
          and(
            eq(organizationMembers.userId, user.id),
            eq(organizationMembers.status, "active"),
            eq(organizationMembers.role, "coach")
          )
        )
        .limit(1);
    }
  } catch (error) {
    if (!isMissingCanonicalOwnerSchema(error)) throw error;
  }
  if (existing) redirect(`/owner?organizationId=${existing.organizationId}`);
  if (coachSeat) redirect(coachHomeHref({ organizationId: coachSeat.organizationId }));

  let contractualConsent: {
    policyVersion: string;
    requiresAcceptance: boolean;
  } | null = null;
  try {
    contractualConsent = await getOwnerContractualConsentRequirement(user);
  } catch {
    // The form receives no consent DTO and fails closed if policy/store lookup
    // cannot be confirmed. It must never assume acceptance by default.
    contractualConsent = null;
  }

  return (
    <OwnerWorkspacePageShell
      member={null}
      organizationId={null}
      locationId={null}
    >
      <main className="grid min-h-screen place-items-center bg-z-canvas px-5 py-12 text-z-ink">
        <section className="w-full max-w-2xl rounded-xl border border-z-line bg-white p-7 sm:p-10">
          {/* La regla de 3 px que abre el formulario cierra la cabecera. */}
          <PageHeader
            title="Crea tu academia"
            description="Indica el nombre, la sede y las actividades. Después podrás añadir gimnastas, clases y cuotas."
            className="border-b-0 pb-0"
          />
          <OwnerSetupForm contractualConsent={contractualConsent} ownerUserId={user.id} />
        </section>
      </main>
    </OwnerWorkspacePageShell>
  );
}
