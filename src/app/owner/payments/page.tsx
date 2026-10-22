import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { z } from "zod";

import { ManualPaymentForm } from "@/components/owner-dashboard/ManualPaymentForm";
import { createClient } from "@/lib/supabase/server";
import { getManualPaymentOptions } from "@/modules/billing/application/manual-payments";
import { OperationalError } from "@/modules/shared/domain/operational-error";

export const dynamic = "force-dynamic";

const pageQuerySchema = z.object({
  organizationId: z.string().uuid().optional(),
  locationId: z.string().uuid().optional(),
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

  return (
    <main className="min-h-screen bg-[#F1F3EF] px-5 py-6 text-slate-950 sm:py-10">
      <div className="mx-auto grid max-w-4xl gap-8">
        <div className="grid gap-5">
          <Link
            href={`/owner?${dashboardQuery.toString()}`}
            className="min-h-11 w-fit content-center rounded-full border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
          >
            Volver al panel
          </Link>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal-900">
              {options.organization.name}
            </p>
            <h1 className="mt-2 font-display text-3xl font-bold tracking-tight sm:text-4xl">
              Registrar un pago recibido
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
              Anota una transferencia, efectivo o pago en el local. Al guardar,
              Zaltyko lo vincula al cargo y actualiza el saldo pendiente.
            </p>
          </div>
          <Link
            href={`/owner/monthly-invoices?${monthlyInvoiceQuery.toString()}`}
            className="min-h-11 w-fit content-center border border-teal-800 bg-teal-800 px-4 py-2 text-sm font-bold text-white hover:bg-teal-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800"
          >
            Emitir cuota mensual
          </Link>
        </div>

        <ManualPaymentForm
          organizationId={options.organization.id}
          charges={options.charges}
        />
      </div>
    </main>
  );
}
