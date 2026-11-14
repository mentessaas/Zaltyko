import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";

import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import { ownerTab, ownerTone, ownerUi } from "@/components/owner-dashboard/owner-ui";
import { SkillTemplatesManager } from "@/components/skill-levels/SkillTemplatesManager";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/db";
import { groups } from "@/db/zaltyko-schema";

import { requireSkillsScope } from "./_lib/skills-scope";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Niveles y progresión | Zaltyko",
  description: "Plantillas de niveles por aparato y progreso de tus gimnastas.",
  robots: { index: false, follow: false },
};

export default async function OwnerSkillsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { scope, locationId } = await requireSkillsScope({
    path: "/owner/skills",
    searchParams: await searchParams,
  });
  const organizationId = scope.organization.id;
  // unbounded-read-ok: grupos activos de una sede, acotados por limit.
  const siteGroups = await db
    .select({ id: groups.id, name: groups.name })
    .from(groups)
    .where(
      and(
        eq(groups.organizationId, organizationId),
        eq(groups.locationId, locationId),
        eq(groups.status, "active")
      )
    )
    .orderBy(asc(groups.name))
    .limit(100);

  const query = (extra: Record<string, string> = {}) =>
    new URLSearchParams({ organizationId, locationId, ...extra }).toString();

  return (
    <OwnerWorkspacePageShell
      member={scope.member}
      organizationId={organizationId}
      organizationName={scope.organization.name}
      locationId={locationId}
    >
      <main className={ownerUi.page}>
        <PageHeader
          title="Niveles y progresión"
          description="Plantillas de niveles por aparato, evaluación rápida por grupo o clase y progreso de cada gimnasta."
          className={ownerUi.pageHeader}
        />
        <div className="grid gap-8">
          {scope.locations.length > 1 ? (
            <nav aria-label="Sedes" className={ownerTone.tabList}>
              {scope.locations.map((location) => (
                <Link
                  key={location.id}
                  href={`/owner/skills?${new URLSearchParams({ organizationId, locationId: location.id }).toString()}`}
                  aria-current={location.id === locationId ? "page" : undefined}
                  className={ownerTab(location.id === locationId)}
                >
                  {location.name}
                </Link>
              ))}
            </nav>
          ) : null}

          <section className={`${ownerUi.card} grid gap-3`} aria-labelledby="skills-groups-title">
            <h2 id="skills-groups-title" className={ownerUi.sectionTitle}>
              Evaluar un grupo
            </h2>
            <p className={ownerUi.help}>
              Elige un grupo para marcar varias gimnastas a la vez y ver su progreso. Para evaluar durante una clase,
              usa el enlace «Evaluar niveles» de la sesión en Asistencia.
            </p>
            {siteGroups.length === 0 ? (
              <p className={ownerUi.muted}>Esta sede todavía no tiene grupos activos.</p>
            ) : (
              <ul className="grid gap-2 sm:grid-cols-2">
                {siteGroups.map((group) => (
                  <li key={group.id}>
                    <Link href={`/owner/skills/evaluate?${query({ groupId: group.id })}`} className={`${ownerUi.secondaryButton} w-full justify-start`}>
                      {group.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <SkillTemplatesManager organizationId={organizationId} locationId={locationId} />
        </div>
      </main>
    </OwnerWorkspacePageShell>
  );
}
