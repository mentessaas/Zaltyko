import Link from "next/link";

import { FamilyNoAccess } from "@/components/family-portal/FamilyNoAccess";
import { FamilyPortalShell } from "@/components/family-portal/FamilyPortalShell";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { resolveFamilyPortalAccess } from "@/modules/family-portal/application/family-portal-access";
import { hasFamilyPortalData } from "@/modules/family-portal/domain/family-portal-access";

import { requireFamilyUser } from "./_lib/family-user";

export const dynamic = "force-dynamic";

export default async function FamilyPortalHomePage() {
  const user = await requireFamilyUser("/familia");
  const access = await resolveFamilyPortalAccess({ userId: user.id });

  return (
    <FamilyPortalShell active="athletes">
      <header className={ownerUi.pageHeader}>
        <h1 className={ownerUi.pageTitle}>Tu familia</h1>
        <p className={ownerUi.pageLead}>
          Consulta el horario, la asistencia y las cuotas de tus gimnastas.
        </p>
      </header>

      {!hasFamilyPortalData(access) ? (
        <FamilyNoAccess />
      ) : (
        <div className="space-y-6">
          {access.academies.map((academy) => (
            <section
              key={academy.organizationId}
              className={ownerUi.card}
              aria-labelledby={`academy-${academy.organizationId}`}
            >
              <h2
                id={`academy-${academy.organizationId}`}
                className={ownerUi.sectionTitle}
              >
                {academy.organizationName}
              </h2>
              {academy.athletes.length === 0 ? (
                <p className={`${ownerUi.muted} mt-3`}>
                  Esta cuenta solo consulta las cuotas de la familia en esta academia.
                </p>
              ) : (
                <ul className="mt-4 grid gap-3 sm:grid-cols-2">
                  {academy.athletes.map((athlete) => (
                    <li key={athlete.athleteId} className={ownerUi.listItem}>
                      <p className="font-semibold text-z-ink">{athlete.displayName}</p>
                      <Link
                        href={`/familia/gimnastas/${athlete.athleteId}`}
                        className={`${ownerUi.textLink} mt-2 inline-block`}
                      >
                        Ver horario y asistencia
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
              {academy.feeFamilyIds.length > 0 ? (
                <Link
                  href="/familia/cuotas"
                  className={`${ownerUi.secondaryButton} mt-4`}
                >
                  Ver cuotas
                </Link>
              ) : null}
            </section>
          ))}
        </div>
      )}
    </FamilyPortalShell>
  );
}
