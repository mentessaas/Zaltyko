import { notFound, redirect } from "next/navigation";
import { Metadata } from "next";
import { eq } from "drizzle-orm";

import { db } from "@/db";
import { academies, athletes, guardians, guardianAthletes, profiles } from "@/db/schema";
import { GuardiansPage } from "@/components/athletes/guardians/GuardiansPage";

interface PageProps {
  params: {
    academyId: string;
    athleteId: string;
  };
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const [athlete] = await db
    .select({ name: athletes.name })
    .from(athletes)
    .where(eq(athletes.id, params.athleteId))
    .limit(1);

  const name = athlete?.name ?? "Atleta";

  return {
    title: `${name} · Familiares`,
    description: `Gestión de contactos familiares para ${name}.`,
  };
}

export default async function AthleteGuardiansPage({ params }: PageProps) {
  const { academyId, athleteId } = params;

  // Verificar que el atleta existe y pertenece a la academia
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

  // Obtener la academia
  const [academy] = await db
    .select({ id: academies.id, name: academies.name })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    notFound();
  }

  // Obtener los guardianes asociados a este atleta
  const guardianLinks = await db
    .select({
      linkId: guardianAthletes.id,
      guardianId: guardians.id,
      name: guardians.name,
      email: guardians.email,
      phone: guardians.phone,
      relationship: guardians.relationship,
      isPrimary: guardianAthletes.isPrimary,
      profileId: guardians.profileId,
    })
    .from(guardianAthletes)
    .innerJoin(guardians, eq(guardianAthletes.guardianId, guardians.id))
    .where(eq(guardianAthletes.athleteId, athleteId));

  const guardiansWithLinks = guardianLinks.map((g) => ({
    linkId: g.linkId,
    guardianId: g.guardianId,
    name: g.name,
    email: g.email,
    phone: g.phone,
    linkRelationship: g.relationship,
    notifyEmail: true,
    notifySms: false,
    isPrimary: g.isPrimary,
    profileId: g.profileId,
  }));

  return (
    <GuardiansPage
      academyId={academyId}
      athleteId={athleteId}
      athleteName={athlete.name}
      academyName={academy.name}
      guardians={guardiansWithLinks}
    />
  );
}
