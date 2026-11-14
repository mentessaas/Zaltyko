import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";

import { OwnerWorkspacePageShell } from "@/components/owner-dashboard/OwnerWorkspacePageShell";
import { ownerUi } from "@/components/owner-dashboard/owner-ui";
import { SkillRosterEvaluator } from "@/components/skill-levels/SkillRosterEvaluator";
import { PageHeader } from "@/components/ui/page-header";

import { requireSkillsScope } from "../_lib/skills-scope";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Evaluar niveles | Zaltyko",
  description: "Marca varias gimnastas a la vez y consulta el progreso del grupo.",
  robots: { index: false, follow: false },
};

const sourceSchema = z.object({
  groupId: z.guid().optional(),
  sessionId: z.guid().optional(),
  templateId: z.guid().optional(),
});

export default async function OwnerSkillsEvaluatePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { scope, locationId, raw } = await requireSkillsScope({
    path: "/owner/skills/evaluate",
    searchParams: await searchParams,
  });
  const source = sourceSchema.safeParse({
    groupId: raw.groupId,
    sessionId: raw.sessionId,
    templateId: raw.templateId,
  });
  // Exactamente un origen: un grupo o una sesión.
  if (!source.success || Boolean(source.data.groupId) === Boolean(source.data.sessionId)) notFound();
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
        <Link href={source.data.sessionId ? `/owner/attendance?${context}` : `/owner/skills?${context}`} className={ownerUi.backLink}>
          ← {source.data.sessionId ? "Volver a Asistencia" : "Volver a Niveles y progresión"}
        </Link>
        <PageHeader
          title="Evaluar niveles"
          description="Elige los elementos, marca las gimnastas y guarda de una vez."
          className={`${ownerUi.pageHeader} mt-3`}
        />
        <SkillRosterEvaluator
          organizationId={organizationId}
          locationId={locationId}
          source={
            source.data.groupId
              ? { kind: "group", id: source.data.groupId }
              : { kind: "session", id: source.data.sessionId! }
          }
          initialTemplateId={source.data.templateId ?? null}
        />
      </main>
    </OwnerWorkspacePageShell>
  );
}
