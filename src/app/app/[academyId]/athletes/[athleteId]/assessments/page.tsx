import { notFound } from "next/navigation";
import { Metadata } from "next";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { athletes } from "@/db/schema";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import AthleteEvaluationsTab from "@/components/assessments/AthleteEvaluationsTab";

interface PageProps {
  params: Promise<{
    academyId: string;
    athleteId: string;
  }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { athleteId } = await params;
  const [athlete] = await db
    .select({ name: athletes.name })
    .from(athletes)
    .where(eq(athletes.id, athleteId))
    .limit(1);

  const name = athlete?.name ?? "Atleta";

  return {
    title: `${name} · Evaluaciones`,
    description: `Historial de evaluaciones de ${name}.`,
  };
}

export default async function AthleteAssessmentsPage({ params }: PageProps) {
  const { academyId, athleteId } = await params;

  // Fetch athlete
  const [athlete] = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      academyId: athletes.academyId,
    })
    .from(athletes)
    .where(eq(athletes.id, athleteId))
    .limit(1);

  if (!athlete || athlete.academyId !== academyId) {
    notFound();
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Atletas", href: `/app/${academyId}/athletes` },
          { label: athlete.name || "Atleta", href: `/app/${academyId}/athletes/${athleteId}` },
          { label: "Evaluaciones" },
        ]}
      />

      <div>
        <h1 className="text-2xl font-bold">Evaluaciones de {athlete.name}</h1>
        <p className="text-muted-foreground mt-1">
          Historial completo de evaluaciones y progreso del atleta
        </p>
      </div>

      <AthleteEvaluationsTab
        academyId={academyId}
        athleteId={athleteId}
        athleteName={athlete.name}
      />
    </div>
  );
}
