import { notFound } from "next/navigation";
import { desc, eq, and, sql } from "drizzle-orm";

import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth/current-user";
import { assertAcademyOwner } from "@/lib/actor-pages/guard";
import { AuditTimeline } from "@/components/audit/AuditTimeline";

export default async function AuditTimelinePage({
  params,
}: {
  params: Promise<{ academyId: string }>;
}) {
  const { academyId } = await params;
  const user = await getCurrentUser();
  if (!user) notFound();
  if (!(await assertAcademyOwner(academyId, user))) notFound();

  const rows = await db
    .select()
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.resourceType, "actor_page"),
        sql`${auditLogs.resourceId} IN (SELECT id FROM actor_pages WHERE academy_id = ${academyId})`
      )
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(100);

  // Convertir `Date | null` (Drizzle) a `string` (componente espera ISO).
  const entries = rows.map((r) => ({
    id: r.id,
    action: r.action,
    module: r.module,
    resourceType: r.resourceType,
    resourceId: r.resourceId,
    description: r.description,
    status: r.status,
    createdAt: (r.createdAt ?? new Date(0)).toISOString(),
  }));

  return <AuditTimeline entries={entries} />;
}
