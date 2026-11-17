import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";

import { OwnerAcademySettingsManager } from "@/components/owner-dashboard/OwnerAcademySettingsManager";
import {
  OwnerCollectionDaySettings,
  type OwnerCollectionDayInitial,
} from "@/components/owner-dashboard/OwnerCollectionDaySettings";
import { OwnerStripeConnectCard } from "@/components/owner-dashboard/OwnerStripeConnectCard";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { PageHeader } from "@/components/ui/page-header";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import {
  isFamilyAutomaticCollectionFlagEnabled,
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/family-collection/application/config";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import { isConnectOnboardingFlagEnabled } from "@/modules/payments-connect/application/config";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ajustes | Zaltyko",
  description: "Datos de tu academia y sus sedes.",
  robots: { index: false, follow: false },
};

const querySchema = z.object({ organizationId: z.guid().optional() }).strict();

/**
 * «Día de cobro» (cobro automático de cuotas, Fase 3). Con la bandera
 * apagada, fuera de la clave de test o contra la base de producción no se
 * carga ni el servicio (se lee del entorno, sin base). Si el servicio dice
 * «no disponible» (sin tablas) o la lectura falla, no se pinta nada y la
 * página sigue: en el registro solo van la academia y el tipo de error.
 */
async function loadCollectionDay(
  userId: string,
  organizationId: string
): Promise<OwnerCollectionDayInitial | null> {
  if (
    !isFamilyAutomaticCollectionFlagEnabled() ||
    resolveConnectEnvironment() !== "test" ||
    isProductionDatabase()
  ) {
    return null;
  }
  try {
    const { getCollectionSettings } = await import(
      "@/modules/family-collection/application/collection-settings-service"
    );
    const settings = await getCollectionSettings({ userId, organizationId });
    return { collectionDayOfMonth: settings.collectionDayOfMonth, version: settings.version };
  } catch (error) {
    if (!(error instanceof OperationalError)) {
      logger.warn("Ajustes: no se pudo leer el día de cobro", {
        organizationId,
        errorName: error instanceof Error ? error.name : "unknown",
      });
    }
    return null;
  }
}

export default async function OwnerSettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient(await cookies());
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/owner/settings");

  const raw = await searchParams;
  const query = querySchema.safeParse({
    organizationId: typeof raw.organizationId === "string" ? raw.organizationId : undefined,
  });
  if (!query.success) notFound();

  let scope: Awaited<ReturnType<typeof resolveOwnerScope>>;
  try {
    scope = await resolveOwnerScope({ userId: user.id, organizationId: query.data.organizationId });
  } catch (error) {
    if (error instanceof OperationalError) {
      if (error.code === "FORBIDDEN" && !query.data.organizationId) redirect("/owner/setup");
      if (["FORBIDDEN", "LOCATION_SCOPE_DENIED", "INVALID_RELATION", "NOT_FOUND"].includes(error.code)) notFound();
    }
    throw error;
  }
  if (scope.member.role !== "owner" || scope.member.locationScopeMode !== "all") notFound();
  if (!query.data.organizationId) {
    redirect(`/owner/settings?organizationId=${encodeURIComponent(scope.organization.id)}`);
  }

  const connectEnabled = isConnectOnboardingFlagEnabled();
  const collectionDay = connectEnabled ? await loadCollectionDay(user.id, scope.organization.id) : null;

  return (
    <OwnerWorkspacePageShell
      member={scope.member}
      organizationId={scope.organization.id}
      organizationName={scope.organization.name}
    >
      <main className={ownerUi.page}>
        <PageHeader
          title="Ajustes"
          description="Los datos de tu academia y sus sedes."
          className={ownerUi.pageHeader}
        />
        <OwnerAcademySettingsManager key={scope.organization.id} organizationId={scope.organization.id} />
        {connectEnabled ? (
          <div className="mt-6">
            <OwnerStripeConnectCard key={scope.organization.id} organizationId={scope.organization.id}>
              {collectionDay ? (
                <OwnerCollectionDaySettings organizationId={scope.organization.id} initial={collectionDay} />
              ) : null}
            </OwnerStripeConnectCard>
          </div>
        ) : null}
      </main>
    </OwnerWorkspacePageShell>
  );
}
