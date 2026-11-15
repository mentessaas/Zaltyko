import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { z } from "zod";

import { ManualPaymentForm } from "@/components/owner-dashboard/ManualPaymentForm";
import { PaymentRemindersPanel } from "@/components/owner-dashboard/PaymentRemindersPanel";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { db } from "@/db";
import { getManualPaymentOptions } from "@/modules/billing/application/manual-payments";
import {
  getPaymentReminderOverview,
  type ReminderOverview,
} from "@/modules/payment-reminders/application/service";
import {
  arePaymentRemindersAvailable,
  isAutomaticPaymentRemindersFlagEnabled,
} from "@/modules/payment-reminders/application/storage";
import { resolveOwnerScope } from "@/modules/owner-dashboard/application/owner-scope";
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
          />

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
