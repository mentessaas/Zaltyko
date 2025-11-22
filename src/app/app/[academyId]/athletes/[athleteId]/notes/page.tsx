import { notFound } from "next/navigation";
import { eq, and } from "drizzle-orm";

import { db } from "@/db";
import { athletes, coachNotes } from "@/db/schema";
import { CoachNotesManager } from "@/components/coaches/CoachNotesManager";

interface PageProps {
  params: {
    academyId: string;
    athleteId: string;
  };
}

export default async function AthleteNotesPage({ params }: PageProps) {
  const { academyId, athleteId } = params;

  const [athlete] = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      academyId: athletes.academyId,
    })
    .from(athletes)
    .where(and(eq(athletes.id, athleteId), eq(athletes.academyId, academyId)))
    .limit(1);

  if (!athlete) {
    notFound();
  }

  // Cargar notas iniciales
  const initialNotes = await db
    .select({
      id: coachNotes.id,
      athleteId: coachNotes.athleteId,
      note: coachNotes.note,
      sharedWithParents: coachNotes.sharedWithParents,
      tags: coachNotes.tags,
      createdAt: coachNotes.createdAt,
      authorId: coachNotes.authorId,
    })
    .from(coachNotes)
    .where(eq(coachNotes.athleteId, athleteId))
    .orderBy(coachNotes.createdAt);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold">Notas sobre {athlete.name}</h1>
        <p className="text-muted-foreground mt-1">
          Notas y observaciones de entrenadores sobre este atleta
        </p>
      </div>

      <CoachNotesManager
        academyId={academyId}
        athleteId={athleteId}
        initialNotes={initialNotes.map((note) => ({
          id: note.id,
          athleteId: note.athleteId,
          athleteName: athlete.name || "Atleta",
          note: note.note,
          sharedWithParents: note.sharedWithParents,
          tags: note.tags,
          createdAt: note.createdAt?.toISOString() || new Date().toISOString(),
          authorId: note.authorId,
          authorName: "Entrenador", // TODO: obtener nombre del autor
        }))}
      />
    </div>
  );
}

