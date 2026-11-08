import { sql } from "drizzle-orm";

import { db } from "@/db";
import { FounderPlanForm } from "./FounderPlanForm";

export const dynamic = "force-dynamic";

type OrganizationRow = {
  id: string;
  name: string;
  created_at: string;
  plan_code: string | null;
  source: string | null;
  effective_until: string | null;
  active_athletes: number;
};

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  growth: "Growth",
  network: "Network",
};

const SOURCE_LABELS: Record<string, string> = {
  bootstrap: "Inicial",
  stripe_subscription: "Suscripción",
  contract: "Fundador / contrato",
  trial: "Prueba",
  trial_expired: "Prueba terminada",
};

function formatDate(value: string | null) {
  if (!value) return "Sin fecha de fin";
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(value)
  );
}

export default async function FounderPlansPage() {
  const result = await db.execute(sql`
    select
      organization.id,
      organization.name,
      organization.created_at,
      entitlement.plan_code::text as plan_code,
      entitlement.source::text as source,
      entitlement.effective_until,
      (
        select count(*)
        from zaltyko.athletes athlete
        where athlete.organization_id = organization.id and athlete.is_active
      )::int as active_athletes
    from zaltyko.organizations organization
    left join zaltyko.organization_entitlements entitlement
      on entitlement.organization_id = organization.id
    order by organization.created_at desc
    limit 200
  `);
  const organizations = result.rows as OrganizationRow[];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl font-bold">Plan Fundadores</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-white/70">
          Concede Starter o Growth sin cobro a las academias del piloto, con fecha de fin (máximo un año). Al terminar vuelven a
          Free; si superan sus límites quedan en solo lectura con los datos conservados. Cada concesión queda auditada.
        </p>
      </header>

      {organizations.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/5 p-5 text-sm text-white/70">
          Todavía no hay academias en el modelo nuevo.
        </p>
      ) : (
        <ul className="grid gap-3">
          {organizations.map((organization) => (
            <li key={organization.id} className="rounded-xl border border-white/10 bg-white/5 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-words font-semibold">{organization.name}</h2>
                  <p className="mt-1 text-xs text-white/60">
                    {organization.active_athletes} gimnastas activos · alta {formatDate(organization.created_at)}
                  </p>
                </div>
                <p className="text-right text-xs text-white/70">
                  <span className="block text-sm font-semibold text-white">
                    {PLAN_LABELS[organization.plan_code ?? ""] ?? "Sin plan"}
                  </span>
                  {SOURCE_LABELS[organization.source ?? ""] ?? organization.source ?? "—"} ·{" "}
                  {formatDate(organization.effective_until)}
                </p>
              </div>
              <FounderPlanForm organizationId={organization.id} organizationName={organization.name} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
