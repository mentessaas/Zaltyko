import { notFound } from "next/navigation";
import { Metadata } from "next";
import { eq, and, desc } from "drizzle-orm";

import { db } from "@/db";
import { academies, athletes, athleteDocuments } from "@/db/schema";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { DocumentUploadModal } from "@/components/athletes/DocumentUploadModal";
import { AthleteDocumentsList } from "@/components/athletes/AthleteDocumentsList";
import type { AthleteDocumentWithUrl } from "@/types/athletes";

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
    title: `${name} · Documentos`,
    description: `Gestión de documentos de ${name}.`,
  };
}

export default async function AthleteDocumentsPage({ params }: PageProps) {
  const { academyId, athleteId } = await params;

  // Fetch athlete
  const [athlete] = await db
    .select({
      id: athletes.id,
      name: athletes.name,
      academyId: athletes.academyId,
      tenantId: athletes.tenantId,
    })
    .from(athletes)
    .where(eq(athletes.id, athleteId))
    .limit(1);

  if (!athlete || athlete.academyId !== academyId) {
    notFound();
  }

  // Fetch academy
  const [academy] = await db
    .select({ id: academies.id, name: academies.name })
    .from(academies)
    .where(eq(academies.id, academyId))
    .limit(1);

  if (!academy) {
    notFound();
  }

  // Fetch documents
  const documents = await db
    .select()
    .from(athleteDocuments)
    .where(and(
      eq(athleteDocuments.athleteId, athleteId),
      eq(athleteDocuments.tenantId, athlete.tenantId)
    ))
    .orderBy(desc(athleteDocuments.createdAt));

  const documentsWithUrl: AthleteDocumentWithUrl[] = documents.map((doc) => ({
    ...doc,
    fileUrl: doc.fileUrl,
  }));

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Atletas", href: `/app/${academyId}/athletes` },
          { label: athlete.name || "Atleta", href: `/app/${academyId}/athletes/${athleteId}` },
          { label: "Documentos" },
        ]}
      />

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Documentos de {athlete.name}</h1>
          <p className="text-muted-foreground mt-1">
            Gestiona los documentos y archivos de {athlete.name}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl">
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
          <div className="p-6">
            {documentsWithUrl.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground">
                  No hay documentos cargados para este atleta.
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Utiliza el botón de abajo para subir el primer documento.
                </p>
              </div>
            ) : (
              <AthleteDocumentsList
                documents={documentsWithUrl}
                athleteId={athleteId}
                onDelete={async (documentId) => {
                  "use server";
                  // This is handled client-side via the component
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
