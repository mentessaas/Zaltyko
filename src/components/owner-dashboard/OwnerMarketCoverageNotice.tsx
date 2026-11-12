import Link from "next/link";
import { eq } from "drizzle-orm";
import { Globe } from "lucide-react";

import { db } from "@/db";
import { organizations } from "@/db/zaltyko-schema";
import { logger } from "@/lib/logger";
import {
  resolveAdministrativeMarket,
  type AdministrativeMarketCapability,
} from "@/modules/organizations/domain/administrative-market-capabilities";

/** Texto del aviso, separado para poder probarlo sin base de datos. */
export function generalMarketCoverageText(
  market: Pick<AdministrativeMarketCapability, "label">
): string {
  return `Tu academia está en ${market.label}. Ya puedes usar las funciones generales: gimnastas y familias, grupos, clases, asistencia y cuotas registradas a mano. Las funciones específicas de tu país (federación, competiciones, cobros locales y facturación) llegarán más adelante; por ahora nos centramos en España y México.`;
}

/**
 * Aviso permanente para academias del nivel general (fuera de ES y MX). La
 * organización ya viene autorizada por el scope de la página. Si la consulta
 * falla, el Resumen se pinta igual, sin aviso.
 */
export async function OwnerMarketCoverageNotice({
  organizationId,
}: {
  organizationId: string;
}) {
  let countryCode: string | null = null;
  try {
    const [organization] = await db
      .select({ countryCode: organizations.countryCode })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    countryCode = organization?.countryCode ?? null;
  } catch (error) {
    logger.error("Owner market coverage lookup failed", error);
    return null;
  }
  const market = countryCode ? resolveAdministrativeMarket(countryCode) : null;
  if (!market || market.tier !== "general") return null;

  return (
    <aside
      aria-labelledby="owner-market-coverage-title"
      className="mx-auto mt-6 max-w-6xl rounded-md border border-z-line border-t-[3px] border-t-z-ink bg-white p-5"
    >
      <div className="flex gap-3">
        <Globe
          className="mt-0.5 h-5 w-5 shrink-0 text-z-brand-600"
          aria-hidden="true"
        />
        <div>
          <h2
            id="owner-market-coverage-title"
            className="font-display text-lg font-bold text-z-ink"
          >
            Funciones de tu país
          </h2>
          <p className="mt-1 text-sm leading-6 text-z-soft">
            {generalMarketCoverageText(market)}
          </p>
          <Link
            href="/contact?type=market_access"
            className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-z-brand-600 underline underline-offset-4"
          >
            Cuéntanos qué necesitas en tu país
          </Link>
        </div>
      </div>
    </aside>
  );
}
