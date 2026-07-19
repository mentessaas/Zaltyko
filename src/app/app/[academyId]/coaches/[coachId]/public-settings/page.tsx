import { notFound } from "next/navigation";
import { eq, and } from "drizzle-orm";

import { db } from "@/db";
import { coaches } from "@/db/schema";
import { CoachPublicProfileEditor } from "@/components/coaches/CoachPublicProfileEditor";
import { Breadcrumb } from "@/components/ui/breadcrumb";

interface PageProps {
  params: Promise<{
    academyId: string;
    coachId: string;
  }>;
}

export default async function CoachPublicSettingsPage({ params }: PageProps) {
  const { academyId, coachId } = await params;

  const [coach] = await db
    .select({
      id: coaches.id,
      academyId: coaches.academyId,
      isPublic: coaches.isPublic,
      publicBio: coaches.publicBio,
      certifications: coaches.certifications,
      photoGallery: coaches.photoGallery,
      achievements: coaches.achievements,
    })
    .from(coaches)
    .where(eq(coaches.id, coachId))
    .limit(1);

  if (!coach || coach.academyId !== academyId) {
    notFound();
  }

  return (
    <div className="space-y-6 py-6 lg:py-8">
      <Breadcrumb
        items={[
          { label: "Dashboard", href: `/app/${academyId}/dashboard` },
          { label: "Entrenadores", href: `/app/${academyId}/coaches` },
          { label: "Perfil Público" },
        ]}
      />
      <div className="rounded-2xl border border-zaltyko-mist bg-white p-6 shadow-soft">
        <h1 className="font-display text-2xl font-bold text-zaltyko-navy">Configuración de Perfil Público</h1>
        <p className="mt-1 text-zaltyko-text-secondary">
          Personaliza tu perfil público visible para padres y atletas
        </p>
      </div>

      <CoachPublicProfileEditor
        coachId={coachId}
        academyId={academyId}
        initialData={{
          isPublic: coach.isPublic ?? false,
          publicBio: coach.publicBio,
          certifications: (coach.certifications as Array<{
            name: string;
            issuer: string;
            date: string;
            url?: string;
          }>) || [],
          photoGallery: coach.photoGallery || [],
          achievements: (coach.achievements as Array<{
            title: string;
            description?: string;
            date?: string;
          }>) || [],
        }}
        onSaved={() => {
          // Recargar la página para mostrar los cambios
        }}
      />
    </div>
  );
}
