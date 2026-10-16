import { and, eq, inArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { organizationMembers } from "@/db/zaltyko-schema";
import { OwnerSetupForm } from "@/components/owner-dashboard/OwnerSetupForm";
import { isMissingCanonicalOwnerSchema } from "@/lib/auth/canonical-owner-schema";
import { findLegacyAcademyMemberships } from "@/lib/auth/legacy-academy-access";
import { resolveUserHome } from "@/lib/auth/resolve-user-home";
import { getOwnerContractualConsentRequirement } from "@/modules/organizations/application/owner-signup-consent";
import { createClient } from "@/lib/supabase/server";

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
    if (legacyHome.destination === "academy_workspace") {
      redirect(legacyHome.redirectUrl);
    }
    if (legacyHome.destination === "blocked") redirect(legacyHome.redirectUrl);

    return (
      <main className="grid min-h-screen place-items-center bg-[#F1F3EF] px-5 py-12 text-slate-950">
        <section className="w-full max-w-2xl border-t-4 border-amber-700 bg-white p-7 shadow-soft sm:p-10">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-800">
            Cuenta vinculada
          </p>
          <h1 className="mt-3 text-4xl tracking-[-0.04em]">
            No crearemos otra organización
          </h1>
          <p className="mt-4 max-w-xl leading-7 text-slate-600" role="alert">
            Esta cuenta ya tiene una relación con una academia anterior. Para
            conservar sus datos, solicita la vinculación o revisión de esa
            academia antes de continuar.
          </p>
        </section>
      </main>
    );
  }

  let existing: { organizationId: string } | undefined;
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
  } catch (error) {
    if (!isMissingCanonicalOwnerSchema(error)) throw error;
  }
  if (existing) redirect(`/owner?organizationId=${existing.organizationId}`);

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
    <main className="grid min-h-screen place-items-center bg-[#F1F3EF] px-5 py-12 text-slate-950">
      <section className="w-full max-w-2xl border-t-4 border-teal-800 bg-white p-7 shadow-soft sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-800">
          Tu academia
        </p>
        <h1 className="mt-3 text-4xl tracking-[-0.04em]">Crea tu academia</h1>
        <p className="mt-4 max-w-xl leading-7 text-slate-600">
          Indica el nombre, la sede y las actividades. Después podrás añadir
          gimnastas, clases y cuotas.
        </p>
        <OwnerSetupForm contractualConsent={contractualConsent} />
      </section>
    </main>
  );
}
