import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";

import { AssessmentForm } from "@/components/assessment-form";
import { db } from "@/db";
import { academies, athletes, skillCatalog } from "@/db/schema";

interface PageProps {
  params: {
    academyId: string;
  };
}

export default async function AssessmentsPage({ params }: PageProps) {
  const [academy] = await db
    .select({ tenantId: academies.tenantId, name: academies.name })
    .from(academies)
    .where(eq(academies.id, params.academyId))
    .limit(1);

  if (!academy) {
    notFound();
  }

  const athleteRows = await db
    .select({ id: athletes.id, name: athletes.name })
    .from(athletes)
    .where(eq(athletes.academyId, params.academyId))
    .orderBy(asc(athletes.name));

  const skillRows = await db
    .select({ id: skillCatalog.id, name: skillCatalog.name, apparatus: skillCatalog.apparatus })
    .from(skillCatalog)
    .where(eq(skillCatalog.tenantId, academy.tenantId))
    .orderBy(asc(skillCatalog.name))
    .limit(100);

  return (
    <div className="space-y-6 p-8">
      <div>
        <h1 className="text-3xl font-semibold">Evaluaciones técnicas</h1>
        <p className="text-muted-foreground">
          Registra evaluaciones por aparato y lleva el historial de progreso.
        </p>
      </div>
      <AssessmentForm academyId={params.academyId} athletes={athleteRows} skills={skillRows} />
    </div>
  );
}
