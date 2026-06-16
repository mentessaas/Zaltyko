import { eq } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/db";
import { coaches, academies } from "@/db/schema";

import Image from "next/image";
export const dynamic = "force-dynamic";

export default async function CoachesPublicPage() {
  const publicCoaches = await db
    .select({
      id: coaches.id,
      name: coaches.name,
      slug: coaches.slug,
      bio: coaches.bio,
      photoUrl: coaches.photoUrl,
      specialties: coaches.specialties,
      academyName: academies.name,
      academyType: academies.academyType,
    })
    .from(coaches)
    .innerJoin(academies, eq(coaches.academyId, academies.id))
    .where(eq(coaches.isPublic, true))
    .limit(50);

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold">Nuestros Entrenadores</h1>
        <p className="text-muted-foreground">
          Conoce a los profesionales que forman parte de nuestras academias.
        </p>
      </header>

      {publicCoaches.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-muted-foreground">
            Aún no hay entrenadores con perfiles públicos disponibles.
          </p>
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {publicCoaches.map((coach) => (
            <Link
              key={coach.id}
              href={`/coaches/${coach.slug || coach.id}`}
              className="group rounded-lg border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="space-y-4">
                {coach.photoUrl ? (
                  <div className="relative h-32 w-32 overflow-hidden rounded-lg">
                    <Image src={coach.photoUrl}
                      alt={coach.name ?? "Foto del entrenador"}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex h-32 w-32 items-center justify-center rounded-lg bg-muted text-2xl font-semibold text-muted-foreground">
                    {coach.name?.charAt(0).toUpperCase() ?? "?"}
                  </div>
                )}

                <div>
                  <h3 className="text-lg font-semibold group-hover:text-primary">
                    {coach.name}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {coach.academyName} · {coach.academyType ?? "Academia"}
                  </p>
                </div>

                {coach.specialties && coach.specialties.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {coach.specialties.slice(0, 3).map((specialty, idx) => (
                      <span
                        key={idx}
                        className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary"
                      >
                        {specialty}
                      </span>
                    ))}
                  </div>
                )}

                {coach.bio && (
                  <p className="line-clamp-3 text-sm text-muted-foreground">{coach.bio}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

