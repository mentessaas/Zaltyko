import Link from "next/link";
import { CheckCircle2, AlertCircle, Inbox, Receipt, UsersRound, type LucideIcon } from "lucide-react";

import type { OwnerAttentionItems } from "@/modules/owner-dashboard/application/attention-items";
import { ownerUi } from "./owner-ui";

type AttentionRow = {
  key: string;
  icon: LucideIcon;
  title: string;
  detail: string;
  href: string;
  action: string;
  tone: "attention" | "brand";
};

function plural(count: number, one: string, many: string) {
  return `${count} ${count === 1 ? one : many}`;
}

export function OwnerAttentionPanel({
  organizationId,
  scopeQuery,
  items,
}: {
  organizationId: string;
  scopeQuery: string;
  items: OwnerAttentionItems | null;
}) {
  const rows: AttentionRow[] = [];
  if (items && items.unrecordedSessions.count > 0) {
    const latest = items.unrecordedSessions.latest;
    rows.push({
      key: "unrecorded",
      icon: AlertCircle,
      title: plural(items.unrecordedSessions.count, "lista sin pasar", "listas sin pasar"),
      detail: latest ? `Últimos 7 días · la más reciente: ${latest.className}` : "Últimos 7 días",
      href: latest
        ? `/owner/attendance?${new URLSearchParams({ organizationId, locationId: latest.locationId, sessionId: latest.id })}`
        : `/owner/attendance?${scopeQuery}`,
      action: "Completar",
      tone: "attention",
    });
  }
  if (items && (items.newTrialRequests ?? 0) > 0) {
    const count = items.newTrialRequests ?? 0;
    rows.push({
      key: "trial-requests",
      icon: Inbox,
      title: plural(count, "solicitud de prueba nueva", "solicitudes de prueba nuevas"),
      detail: "Familias que piden una clase de prueba",
      href: `/owner/requests?${scopeQuery}`,
      action: "Responder",
      tone: "attention",
    });
  }
  if (items && items.overdueInvoices !== null && items.overdueInvoices > 0) {
    rows.push({
      key: "overdue",
      icon: Receipt,
      title: plural(items.overdueInvoices, "cuota vencida", "cuotas vencidas"),
      detail: "Emitidas y sin cobrar del todo",
      href: `/owner/monthly-invoices?${scopeQuery}`,
      action: "Revisar",
      tone: "attention",
    });
  }
  if (items && items.fullClasses > 0) {
    rows.push({
      key: "full",
      icon: UsersRound,
      title: plural(items.fullClasses, "clase completa", "clases completas"),
      detail: "Sin plazas libres hoy",
      href: `/owner/classes?${scopeQuery}`,
      action: "Ver clases",
      tone: "brand",
    });
  }

  return (
    <section aria-labelledby="owner-attention-title" className={`${ownerUi.card} min-w-0`}>
      <div className="flex items-center justify-between gap-3">
        <h2 id="owner-attention-title" className={ownerUi.sectionTitle}>
          Necesita tu atención
        </h2>
        {rows.length > 0 ? (
          <span className={ownerUi.chipAttention}>
            <span className="sr-only">Avisos: </span>
            {rows.length}
          </span>
        ) : null}
      </div>
      {items === null ? (
        <p role="status" className="mt-3 text-sm leading-6 text-z-soft">
          No pudimos revisar los avisos. No significa que no haya ninguno.
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-3 flex items-start gap-2.5 rounded-[12px] bg-z-comp-50 p-3.5 text-sm leading-6 text-z-comp-600">
          <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Todo al día: no hay listas sin pasar ni clases completas{items.overdueInvoices !== null ? " ni cuotas vencidas" : ""}.</span>
        </p>
      ) : (
        <ul className="mt-3 grid gap-2.5">
          {rows.map((row) => (
            <li key={row.key} className="flex items-center gap-3 rounded-[12px] bg-z-canvas p-3.5">
              <span
                aria-hidden="true"
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-white ${row.tone === "attention" ? "text-z-chalk-600" : "text-z-brand-600"}`}
              >
                <row.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-z-ink">{row.title}</p>
                <p className="break-words text-xs text-z-soft">{row.detail}</p>
              </div>
              <Link
                href={row.href}
                className={`${ownerUi.textLink} touch-target inline-flex shrink-0 items-center px-1`}
                aria-label={`${row.action}: ${row.title}`}
              >
                {row.action}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
