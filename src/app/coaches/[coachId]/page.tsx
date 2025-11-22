import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import Image from "next/image";

import { db } from "@/db";
import { coaches, academies } from "@/db/schema";

interface CoachPublicPageProps {
  params: Promise<{ coachId: string }>;
}

export default async function CoachPublicPage({ params }: CoachPublicPageProps) {
  const { coachId } = await params;

  const [coach] = await db
    .select({
      id: coaches.id,
      name: coaches.name,
      bio: coaches.bio,
      publicBio: coaches.publicBio,
      photoUrl: coaches.photoUrl,
      specialties: coaches.specialties,
      email: coaches.email,
      phone: coaches.phone,
      academyId: coaches.academyId,
      academyName: academies.name,
      academyType: academies.academyType,
      isPublic: coaches.isPublic,
      certifications: coaches.certifications,
      photoGallery: coaches.photoGallery,
      achievements: coaches.achievements,
    })
    .from(coaches)
    .innerJoin(academies, eq(coaches.academyId, academies.id))
    .where(eq(coaches.id, coachId))
    .limit(1);

  if (!coach || !coach.isPublic) {
    notFound();
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8 p-8">
      <div className="flex flex-col gap-6 md:flex-row">
        {coach.photoUrl ? (
          <div className="relative h-48 w-48 flex-shrink-0 overflow-hidden rounded-lg">
            <Image
              src={coach.photoUrl}
              alt={coach.name ?? "Foto del entrenador"}
              fill
              className="object-cover"
            />
          </div>
        ) : (
          <div className="flex h-48 w-48 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-4xl font-semibold text-muted-foreground">
            {coach.name?.charAt(0).toUpperCase() ?? "?"}
          </div>
        )}

        <div className="flex-1 space-y-4">
          <div>
            <h1 className="text-3xl font-bold">{coach.name}</h1>
            <p className="mt-2 text-lg text-muted-foreground">
              {coach.academyName} · {coach.academyType ?? "Academia"}
            </p>
          </div>

          {coach.specialties && coach.specialties.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {coach.specialties.map((specialty, idx) => (
                <span
                  key={idx}
                  className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary"
                >
                  {specialty}
                </span>
              ))}
            </div>
          )}

          {(coach.publicBio || coach.bio) && (
            <div className="prose prose-sm max-w-none">
              <p className="text-muted-foreground whitespace-pre-line">
                {coach.publicBio || coach.bio}
              </p>
            </div>
          )}
        </div>
      </div>

      {(coach.email || coach.phone) && (
        <div className="rounded-lg border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Información de contacto</h2>
          <div className="space-y-2 text-sm">
            {coach.email && (
              <p>
                <span className="font-medium">Email:</span>{" "}
                <a href={`mailto:${coach.email}`} className="text-primary hover:underline">
                  {coach.email}
                </a>
              </p>
            )}
            {coach.phone && (
              <p>
                <span className="font-medium">Teléfono:</span>{" "}
                <a href={`tel:${coach.phone}`} className="text-primary hover:underline">
                  {coach.phone}
                </a>
              </p>
            )}
          </div>
        </div>
      )}

      {coach.certifications && Array.isArray(coach.certifications) && coach.certifications.length > 0 && (
        <div className="rounded-lg border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Certificaciones</h2>
          <div className="space-y-3">
            {coach.certifications.map((cert: any, index: number) => (
              <div key={index} className="flex items-start justify-between border-b pb-3 last:border-0 last:pb-0">
                <div>
                  <p className="font-medium">{cert.name}</p>
                  <p className="text-sm text-muted-foreground">{cert.issuer}</p>
                  {cert.date && (
                    <p className="text-xs text-muted-foreground">
                      {new Date(cert.date).toLocaleDateString("es-ES", {
                        year: "numeric",
                        month: "long",
                      })}
                    </p>
                  )}
                </div>
                {cert.url && (
                  <a
                    href={cert.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline text-sm"
                  >
                    Ver certificado
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {coach.photoGallery && coach.photoGallery.length > 0 && (
        <div className="rounded-lg border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Galería</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {coach.photoGallery.map((photo, index) => (
              <div key={index} className="relative aspect-square overflow-hidden rounded-lg">
                <Image
                  src={photo}
                  alt={`Foto ${index + 1}`}
                  fill
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {coach.achievements && Array.isArray(coach.achievements) && coach.achievements.length > 0 && (
        <div className="rounded-lg border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Logros y Reconocimientos</h2>
          <div className="space-y-3">
            {coach.achievements.map((achievement: any, index: number) => (
              <div key={index} className="border-b pb-3 last:border-0 last:pb-0">
                <p className="font-medium">{achievement.title}</p>
                {achievement.description && (
                  <p className="text-sm text-muted-foreground mt-1">{achievement.description}</p>
                )}
                {achievement.date && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(achievement.date).toLocaleDateString("es-ES", {
                      year: "numeric",
                      month: "long",
                    })}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

