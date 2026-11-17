import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";

import { ManualPaymentForm } from "@/components/owner-dashboard/ManualPaymentForm";
import { OwnerAutomaticCollectionsPanel } from "@/components/owner-dashboard/OwnerAutomaticCollectionsPanel";
import { PaymentRemindersPanel } from "@/components/owner-dashboard/PaymentRemindersPanel";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { getManualPaymentOptions } from "@/modules/billing/application/manual-payments";
import type { OwnerAutomaticCollectionsView } from "@/modules/family-collection/application/family-collection-reads";
import {
  getPaymentReminderOverview,
  type ReminderOverview,
} from "@/modules/payment-reminders/application/service";
import {
  arePaymentRemindersAvailable,
  isAutomaticPaymentRemindersFlagEnabled,
} from "@/modules/payment-reminders/application/storage";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
import {
  isConnectOnboardingFlagEnabled,
  isProductionDatabase,
  resolveConnectEnvironment,
} from "@/modules/payments-connect/application/config";
import { getConnectStatus } from "@/modules/payments-connect/application/connect-onboarding-service";
import { OperationalError } from "@/modules/shared/domain/operational-error";
import {
  getOwnerMonthlyFeesChart,
  resolveOwnerChartScope,
} from "@/modules/owner-dashboard/application/summary-charts";
import { OwnerMonthlyFeesPanel } from "@/components/owner-dashboard/charts/OwnerChartPanels";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const pageQuerySchema = z.object({
  organizationId: z.guid().optional(),
  locationId: z.guid().optional(),
});

/**
 * Cobros automáticos del mes (cobro automático de cuotas, Fase 3). Fuera de
 * la clave de test o contra la base de producción no se carga ni la lectura
 * (se lee del entorno, sin base). Con la bandera apagada sí se lee: la
 * lectura devuelve solo los cobros que ya están en marcha (el pago a mano los
 * tiene bloqueados y pueden necesitar «Marcar como revisado») o `null` si no
 * hay. Sin las tablas de la Fase 3 o sin permiso (solo propiedad o
 * administración con todas las sedes) la lectura devuelve `null`. Un fallo
 * nunca impide registrar un pago: la sección no aparece y en el registro solo
 * van la academia y el tipo.
 */
async function loadAutomaticCollections(
  userId: string,
  organizationId: string
): Promise<OwnerAutomaticCollectionsView | null> {
  if (resolveConnectEnvironment() !== "test" || isProductionDatabase()) return null;
  try {
    const { getOwnerAutomaticCollections } = await import(
      "@/modules/family-collection/application/family-collection-reads"
    );
    return await getOwnerAutomaticCollections({ userId, organizationId });
  } catch (error) {
    if (!(error instanceof OperationalError)) {
      logger.warn("Pagos: no se pudieron leer los cobros automáticos del mes", {
        organizationId,
        errorName: error instanceof Error ? error.name : "unknown",
      });
    }
    return null;
  }
}

export default async function OwnerPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createClient(await cookies());
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login?next=/owner/payments");

  const raw = await searchParams;
  const query = pageQuerySchema.safeParse({
    organizationId:
      typeof raw.organizationId === "string" ? raw.organizationId : undefined,
    locationId: typeof raw.locationId === "string" ? raw.locationId : undefined,
  });
  if (!query.success) notFound();

  let options: Awaited<ReturnType<typeof getManualPaymentOptions>>;
  try {
    options = await getManualPaymentOptions({
      userId: user.id,
      ...query.data,
    });
  } catch (error) {
    if (error instanceof OperationalError && error.code === "FORBIDDEN") {
      if (!query.data.organizationId) redirect("/owner/setup");
      notFound();
    }
    if (
      error instanceof OperationalError &&
      (error.code === "LOCATION_SCOPE_DENIED" || error.code === "NOT_FOUND")
    ) {
      notFound();
    }
    throw error;
  }

  const dashboardQuery = new URLSearchParams({
    organizationId: options.organization.id,
  });
  if (query.data.locationId) {
    dashboardQuery.set("locationId", query.data.locationId);
  }
  const monthlyInvoiceQuery = new URLSearchParams({
    organizationId: options.organization.id,
  });
  if (query.data.locationId) {
    monthlyInvoiceQuery.set("locationId", query.data.locationId);
  }

  let scope: Awaited<ReturnType<typeof resolveOwnerScope>>;
  try {
    scope = await resolveOwnerScope({
      userId: user.id,
      organizationId: options.organization.id,
      locationId: options.selectedLocationId ?? undefined,
    });
  } catch (error) {
    if (
      error instanceof OperationalError &&
      (error.code === "FORBIDDEN" ||
        error.code === "LOCATION_SCOPE_DENIED" ||
        error.code === "NOT_FOUND")
    ) {
      notFound();
    }
    throw error;
  }

  // Recordatorios de cuotas: detrás de ZALTYKO_PAYMENT_REMINDERS_ENABLED y de
  // las tablas candidatas. Si no están, la sección no aparece. Un fallo al
  // leerla nunca debe impedir registrar un pago.
  let reminderOverview: ReminderOverview | null = null;
  if (await arePaymentRemindersAvailable(db)) {
    try {
      reminderOverview = await getPaymentReminderOverview({
        userId: user.id,
        organizationId: scope.organization.id,
        locationId: scope.selectedLocationId ?? undefined,
      });
    } catch {
      reminderOverview = null;
    }
  }

  // Cobro automático de cuotas: con la bandera encendida y sin cuenta de Stripe
  // conectada, un enlace lleva a Ajustes (solo dueños con todas las sedes, como
  // esa pantalla). Sin llamar a Stripe; un fallo al leer el estado lo oculta.
  let showAutomaticCollectionLink = false;
  if (
    isConnectOnboardingFlagEnabled() &&
    scope.member.role === "owner" &&
    scope.member.locationScopeMode === "all"
  ) {
    try {
      const connectState = await getConnectStatus({
        userId: user.id,
        organizationId: scope.organization.id,
        refresh: false,
      });
      showAutomaticCollectionLink =
        connectState.kind === "not_connected" ||
        (connectState.kind === "unavailable" && connectState.reason === "paid_plan_required");
    } catch (error) {
      // El acceso a Conectar Stripe no debe tumbar Pagos: se oculta el enlace.
      // Solo el id de la academia y el nombre del error, nunca su contenido.
      logger.warn("Pagos: no se pudo leer el estado de Conectar Stripe", {
        organizationId: scope.organization.id,
        errorName: error instanceof Error ? error.name : "unknown",
      });
      showAutomaticCollectionLink = false;
    }
  }
  const automaticCollections = await loadAutomaticCollections(user.id, scope.organization.id);
  // Cuotas que se están cobrando solas: el formulario de pago manual explica
  // por qué no se pueden registrar a mano todavía (el servidor responde 409).
  const automaticCollectionInProgress = (automaticCollections?.items ?? [])
    .filter((item) => item.manualPaymentBlocked)
    .map((item) => item.invoiceReference);

  const automaticCollectionHref = `/owner/settings?${new URLSearchParams({
    organizationId: scope.organization.id,
  }).toString()}#cobro-automatico`;

  // Cuotas del mes en curso de esta sede (o de todas): lo que ya se cobró y lo
  // que falta. Tras guardar un pago, el refresco de la página lo actualiza.
  const monthlyFees = await resolveOwnerChartScope({
    scope,
    locationId: options.selectedLocationId,
  })
    .then((chartScope) => getOwnerMonthlyFeesChart(chartScope, true))
    .catch((error: unknown) => {
      logger.error("Owner monthly fees chart failed", error);
      return null;
    });

  return (
    <OwnerWorkspacePageShell
      member={scope.member}
      organizationId={scope.organization.id}
      organizationName={scope.organization.name}
      locationId={scope.selectedLocationId}
    >
      <main className={ownerUi.page}>
        <div className="mx-auto grid max-w-4xl gap-8">
          <div className="grid gap-5">
            <Link
              href={`/owner?${dashboardQuery.toString()}`}
              className={cn(ownerUi.backLink, "w-fit")}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Volver al resumen
            </Link>
            <PageHeader
              title="Registrar un pago recibido"
              description="Anota una transferencia, efectivo o pago en el local. Al guardar, Zaltyko lo vincula al cargo y actualiza el saldo pendiente."
              actions={
                <Link
                  href={`/owner/monthly-invoices?${monthlyInvoiceQuery.toString()}`}
                  className={ownerUi.secondaryButton}
                >
                  Emitir cuota mensual
                </Link>
              }
            />
            {showAutomaticCollectionLink ? (
              <Link href={automaticCollectionHref} className={cn(ownerUi.textLink, "w-fit")}>
                Cobrar las cuotas automáticamente
              </Link>
            ) : null}
          </div>

          {monthlyFees ? (
            <OwnerMonthlyFeesPanel
              chart={monthlyFees}
              links={{ "monthly-invoices": `/owner/monthly-invoices?${monthlyInvoiceQuery.toString()}` }}
              headingLevel="h2"
            />
          ) : null}

          <ManualPaymentForm
            actorId={user.id}
            organizationId={options.organization.id}
            locationId={options.selectedLocationId}
            charges={options.charges}
            nextCursor={options.nextCursor}
            automaticCollectionInvoiceReferences={automaticCollectionInProgress}
          />

          {automaticCollections ? (
            <OwnerAutomaticCollectionsPanel
              organizationId={options.organization.id}
              view={automaticCollections}
            />
          ) : null}

          {reminderOverview ? (
            <PaymentRemindersPanel
              organizationId={options.organization.id}
              locationId={options.selectedLocationId}
              overview={reminderOverview}
              automaticAvailable={isAutomaticPaymentRemindersFlagEnabled()}
              suggestedReplyTo={user.email ?? null}
            />
          ) : null}
        </div>
      </main>
    </OwnerWorkspacePageShell>
  );
}
