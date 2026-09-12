import { and, count, desc, eq, inArray, sql, sum } from "drizzle-orm";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  ArrowUpRight,
  CircleDollarSign,
  FileText,
  RefreshCw,
} from "lucide-react";

import { db } from "@/db";
import { academies, billingInvoices } from "@/db/schema";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/authz";
import { getDevSessionFromCookieStore } from "@/lib/dev-session";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ status?: string }>;
};

const RISKY_STATUSES = ["past_due", "canceled", "unpaid"] as const;

function formatMoney(value: number | string | null | undefined, currency = "eur") {
  const amount = Number(value ?? 0) / 100;
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(amount);
}

function statusLabel(status: string) {
  switch (status) {
    case "paid":
      return "Pagada";
    case "past_due":
      return "Vencida";
    case "unpaid":
      return "Impagada";
    case "canceled":
      return "Cancelada";
    case "open":
      return "Abierta";
    default:
      return status.replace(/_/g, " ");
  }
}

function statusClasses(status: string) {
  if (status === "paid") return "bg-emerald-400/15 text-emerald-200";
  if (RISKY_STATUSES.includes(status as (typeof RISKY_STATUSES)[number])) {
    return "bg-rose-400/15 text-rose-200";
  }
  return "bg-amber-400/15 text-amber-100";
}

export default async function SuperAdminBillingPage({ searchParams }: PageProps) {
  const { status } = await searchParams;
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const devSession = await getDevSessionFromCookieStore(cookieStore);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && !devSession) redirect("/auth/login");

  const profile = user ? await getCurrentProfile(user.id) : null;
  const effectiveProfile = profile ?? (devSession ? { role: "super_admin" } : null);
  if (!effectiveProfile || effectiveProfile.role !== "super_admin") redirect("/app");

  const invoiceCondition =
    status === "risky"
      ? inArray(billingInvoices.status, [...RISKY_STATUSES])
      : undefined;

  const [summary, statusRows, invoices] = await Promise.all([
    db
      .select({
        invoices: count(billingInvoices.id),
        paidInvoices: sql<number>`count(*) filter (where ${billingInvoices.status} = 'paid')`,
        paidAmount: sum(billingInvoices.amountPaid),
        dueAmount: sum(billingInvoices.amountDue),
      })
      .from(billingInvoices)
      .where(invoiceCondition)
      .then(([row]) => row),
    db
      .select({
        status: billingInvoices.status,
        total: count(billingInvoices.id),
        amountPaid: sum(billingInvoices.amountPaid),
      })
      .from(billingInvoices)
      .where(invoiceCondition)
      .groupBy(billingInvoices.status)
      .orderBy(desc(count(billingInvoices.id))),
    db
      .select({
        id: billingInvoices.id,
        status: billingInvoices.status,
        amountDue: billingInvoices.amountDue,
        amountPaid: billingInvoices.amountPaid,
        currency: billingInvoices.currency,
        billingReason: billingInvoices.billingReason,
        hostedInvoiceUrl: billingInvoices.hostedInvoiceUrl,
        invoicePdf: billingInvoices.invoicePdf,
        createdAt: billingInvoices.createdAt,
        academyId: academies.id,
        academyName: academies.name,
      })
      .from(billingInvoices)
      .leftJoin(academies, eq(billingInvoices.academyId, academies.id))
      .where(invoiceCondition)
      .orderBy(desc(billingInvoices.createdAt))
      .limit(50),
  ]);

  const riskyCount = statusRows
    .filter((row) => RISKY_STATUSES.includes(row.status as (typeof RISKY_STATUSES)[number]))
    .reduce((total, row) => total + Number(row.total), 0);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-4 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-zaltyko-electric">
            Control financiero
          </p>
          <h1 className="mt-2 font-display text-3xl font-semibold text-white">
            Cobros globales
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-white/60">
            Visión operativa de recibos sincronizados desde Stripe. Las acciones de cobro
            siguen centralizadas en Stripe Billing para evitar estados divergentes.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/super-admin/billing?status=risky"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-rose-300/30 bg-rose-300/10 px-4 text-sm font-semibold text-rose-100 transition hover:bg-rose-300/20"
          >
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            Ver riesgos
          </Link>
          <Link
            href="/super-admin/logs"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Ver sincronización
          </Link>
        </div>
      </header>

      <section aria-label="Resumen financiero" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Cobrado acumulado", value: formatMoney(summary?.paidAmount), icon: CircleDollarSign },
          { label: "Recibos pagados", value: Number(summary?.paidInvoices ?? 0).toLocaleString("es-ES"), icon: FileText },
          { label: "Importe pendiente", value: formatMoney(summary?.dueAmount), icon: AlertTriangle },
          { label: "En riesgo", value: riskyCount.toLocaleString("es-ES"), icon: RefreshCw },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <article key={metric.label} className="rounded-2xl border border-white/10 bg-white/[0.055] p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/50">{metric.label}</p>
                <Icon className="h-4 w-4 text-zaltyko-electric" aria-hidden="true" />
              </div>
              <p className="mt-4 font-display text-3xl font-semibold text-white">{metric.value}</p>
            </article>
          );
        })}
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.8fr_1.7fr]">
        <article className="rounded-2xl border border-white/10 bg-white/[0.045] p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/50">Distribución</p>
              <h2 className="mt-1 font-display text-xl font-semibold text-white">Estado de recibos</h2>
            </div>
            <span className="text-xs text-white/45">{Number(summary?.invoices ?? 0)} total</span>
          </div>
          <div className="mt-6 space-y-3">
            {statusRows.length === 0 ? (
              <p className="rounded-xl border border-dashed border-white/15 p-4 text-sm text-white/50">
                No hay recibos que coincidan con el filtro actual.
              </p>
            ) : (
              statusRows.map((row) => (
                <div key={row.status} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/10 p-3">
                  <div>
                    <p className="text-sm font-semibold capitalize text-white">{statusLabel(row.status)}</p>
                    <p className="mt-1 text-xs text-white/45">{Number(row.total).toLocaleString("es-ES")} recibo(s)</p>
                  </div>
                  <p className="text-sm font-semibold text-white">{formatMoney(row.amountPaid)}</p>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.045]">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 p-5 sm:p-6">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-white/50">Últimos 50</p>
              <h2 className="mt-1 font-display text-xl font-semibold text-white">Actividad de facturación</h2>
            </div>
            <span className="text-xs text-white/45">Fuente: billing_invoices</span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-white/45">
                <tr>
                  <th className="px-5 py-3 font-semibold">Recibo</th>
                  <th className="px-5 py-3 font-semibold">Academia</th>
                  <th className="px-5 py-3 font-semibold">Estado</th>
                  <th className="px-5 py-3 text-right font-semibold">Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {invoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-white/[0.03]">
                    <td className="whitespace-nowrap px-5 py-4">
                      <p className="font-medium text-white">{invoice.billingReason ?? "Cobro Stripe"}</p>
                      <p className="mt-1 text-xs text-white/45">
                        {invoice.createdAt ? new Date(invoice.createdAt).toLocaleDateString("es-ES") : "—"}
                      </p>
                    </td>
                    <td className="px-5 py-4">
                      {invoice.academyId ? (
                        <Link href={`/super-admin/academies/${invoice.academyId}`} className="font-medium text-zaltyko-electric hover:underline">
                          {invoice.academyName ?? "Academia"}
                        </Link>
                      ) : (
                        <span className="text-white/50">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(invoice.status)}`}>
                        {statusLabel(invoice.status)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <p className="font-semibold text-white">{formatMoney(invoice.amountPaid ?? invoice.amountDue, invoice.currency)}</p>
                      {(invoice.hostedInvoiceUrl || invoice.invoicePdf) && (
                        <a
                          href={invoice.hostedInvoiceUrl ?? invoice.invoicePdf ?? "#"}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-xs text-zaltyko-electric hover:underline"
                        >
                          Abrir recibo <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
                {invoices.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-12 text-center text-sm text-white/50">
                      No hay facturas sincronizadas todavía.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  );
}
