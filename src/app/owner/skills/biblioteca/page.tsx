import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ElementLibraryBrowser } from "@/components/element-library/ElementLibraryBrowser";
import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { PageHeader } from "@/components/ui/page-header";
import { db } from "@/db";
import {
  getEditionGroupLabels,
  isElementLibraryAvailableForPage,
  listPublishedCatalogDisciplines,
} from "@/modules/element-library/application/element-library-service";

import { requireSkillsScope } from "../_lib/skills-scope";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Biblioteca de elementos | Zaltyko",
  description: "Grupo y valor de cada elemento según el Código de Puntuación, con las notas técnicas de tu academia.",
  robots: { index: false, follow: false },
};

export default async function OwnerElementLibraryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { scope, locationId } = await requireSkillsScope({
    path: "/owner/skills/biblioteca",
    searchParams: await searchParams,
  });
  // Sin la bandera, sin las tablas o sin las columnas de enlace, la página no existe.
  if (!(await isElementLibraryAvailableForPage(db))) notFound();
  const disciplines = await listPublishedCatalogDisciplines(db);
  const organizationId = scope.organization.id;
  const context = new URLSearchParams({ organizationId, locationId }).toString();

  return (
    <OwnerWorkspacePageShell
      member={scope.member}
      organizationId={organizationId}
      organizationName={scope.organization.name}
      locationId={locationId}
    >
      <main className={ownerUi.page}>
        <Link href={`/owner/skills?${context}`} className={ownerUi.backLink}>
          ← Volver a Niveles y progresión
        </Link>
        <PageHeader
          title="Biblioteca de elementos"
          description="Busca un elemento por aparato, grupo, valor o nombre, y guarda las notas técnicas de tu academia."
          className={`${ownerUi.pageHeader} mt-3`}
        />
        <ElementLibraryBrowser
          organizationId={organizationId}
          locationId={locationId}
          disciplines={disciplines}
          groupLabels={getEditionGroupLabels()}
        />
      </main>
    </OwnerWorkspacePageShell>
  );
}
