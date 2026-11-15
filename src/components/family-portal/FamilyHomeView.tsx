import Link from "next/link";

import { FamilyNoAccess } from "@/components/family-portal/FamilyNoAccess";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import type { FamilyPortalAcademy } from "@/modules/family-portal/domain/family-portal-access";

/**
 * Cuerpo de «Tu familia»: las academias y las gimnastas vinculadas a la cuenta.
 * Lo comparten /familia (datos reales) y la demo pública, que le pasa otra
 * `basePath` para que los enlaces se queden en /demo/familia.
 */
export function FamilyHomeView({
  academies,
  basePath = "/familia",
}: {
  academies: FamilyPortalAcademy[];
  basePath?: string;
}) {
  if (academies.length === 0) return <FamilyNoAccess />;
  return (
    <div className="space-y-6">
      {academies.map((academy) => (
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
                    href={`${basePath}/gimnastas/${athlete.athleteId}`}
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
              href={`${basePath}/cuotas`}
              className={`${ownerUi.secondaryButton} mt-4`}
            >
              Ver cuotas
            </Link>
          ) : null}
        </section>
      ))}
    </div>
  );
}
