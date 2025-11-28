"use client";

import { useState, useMemo } from "react";

import type { InvoiceRow } from "@/types/billing";

function formatInvoiceAmount(invoice: InvoiceRow) {
  const currency = (invoice.currency ?? "eur").toUpperCase();
  const cents = invoice.amountPaid ?? invoice.amountDue ?? 0;
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format((cents ?? 0) / 100);
}

interface InvoiceListProps {
  invoices: InvoiceRow[];
  loading: boolean;
  onSync: () => void;
  isSyncing: boolean;
  disabled: boolean;
}

export function InvoiceList({
  invoices,
  loading,
  onSync,
  isSyncing,
  disabled,
}: InvoiceListProps) {
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filteredInvoices = useMemo(() => {
    if (statusFilter === "all") {
      return invoices;
    }
    return invoices.filter((invoice) => invoice.status === statusFilter);
  }, [invoices, statusFilter]);

  return (
    <section className="space-y-3 rounded-lg border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-medium">Historial de facturación</h2>
          <p className="text-sm text-muted-foreground">
            Facturas emitidas durante los últimos ciclos de facturación.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="all">Todos los estados</option>
            <option value="paid">Pagadas</option>
            <option value="open">Abiertas</option>
            <option value="draft">Borrador</option>
            <option value="uncollectible">No cobrables</option>
            <option value="void">Anuladas</option>
          </select>
          <button
            onClick={onSync}
            disabled={isSyncing || loading || disabled}
            className="inline-flex items-center justify-center rounded-md border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-semibold text-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSyncing ? "Sincronizando…" : "Sincronizar facturas"}
          </button>
          {loading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        </div>
      </div>

      {filteredInvoices.length === 0 && !loading ? (
        <p className="text-sm text-muted-foreground">
          {invoices.length === 0
            ? "Aún no hay facturas registradas para esta academia."
            : "No hay facturas que coincidan con el filtro seleccionado."}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left">Fecha</th>
                <th className="px-4 py-2 text-left">Importe</th>
                <th className="px-4 py-2 text-left">Estado</th>
                <th className="px-4 py-2 text-left">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredInvoices.map((invoice) => {
                const created = new Date(invoice.createdAt);
                return (
                  <tr key={invoice.id}>
                    <td className="px-4 py-3">
                      {new Intl.DateTimeFormat("es-ES", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      }).format(created)}
                    </td>
                    <td className="px-4 py-3">{formatInvoiceAmount(invoice)}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${
                          invoice.status === "paid"
                            ? "bg-green-100 text-green-800"
                            : invoice.status === "open"
                            ? "bg-blue-100 text-blue-800"
                            : invoice.status === "draft"
                            ? "bg-gray-100 text-gray-800"
                            : invoice.status === "uncollectible"
                            ? "bg-red-100 text-red-800"
                            : invoice.status === "void"
                            ? "bg-gray-100 text-gray-600"
                            : "bg-gray-100 text-gray-800"
                        }`}
                      >
                        {invoice.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {invoice.hostedInvoiceUrl || invoice.invoicePdf ? (
                        <a
                          href={invoice.hostedInvoiceUrl ?? invoice.invoicePdf ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-medium text-primary hover:underline"
                        >
                          Ver factura
                        </a>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

