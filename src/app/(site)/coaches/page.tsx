import type { Metadata } from "next";
import { eq, and } from "drizzle-orm";
import Link from "next/link";

import { db } from "@/db";
import { coaches, academies } from "@/db/schema";

import Image from "next/image";
import { cn } from "@/lib/utils";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Directorio de Coaches de Gimnasia",
  description:
    "Encuentra entrenadores de gimnasia artística y rítmica en academias que dirigen sus clases con Zaltyko.",
  keywords: [
    "entrenadores gimnasia",
    "coaches gimnasia artística",
    "coaches gimnasia rítmica",
    "directorio coaches",
  ],
  openGraph: {
    title: "Directorio de Coaches de Gimnasia",
    description:
      "Encuentra entrenadores de gimnasia artística y rítmica en academias que dirigen sus clases con Zaltyko.",
    type: "website",
  },
};

interface PageProps {
  searchParams: Promise<{ modalidad?: string }>;
}

const MODALIDADES = [
  { value: "artistica", label: "Artística" },
  { value: "ritmica", label: "Rítmica" },
  { value: "trampolin", label: "Trampolín" },
] as const;

export default async function CoachesPublicPage({ searchParams }: PageProps) {
  const { modalidad } = await searchParams;
  const activeModalidad = MODALIDADES.find((m) => m.value === modalidad)?.value;

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
    .where(
      activeModalidad
        ? and(eq(coaches.isPublic, true), eq(academies.academyType, activeModalidad))
        : eq(coaches.isPublic, true)
    )
    .limit(50);

  return (
    <div className="mx-auto max-w-6xl space-y-8 p-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold">Encuentra tu entrenador de gimnasia</h1>
        <p className="text-muted-foreground">
          Coaches verificados de academias que dirigen sus clases con Zaltyko. Explora perfiles por modalidad, especialidad y años de experiencia.
        </p>
        <p className="text-sm text-muted-foreground">
          {publicCoaches.length === 0
            ? "Sin perfiles publicados"
            : `${publicCoaches.length} entrenadores en el directorio`}
        </p>
      </header>

      <nav className="flex flex-wrap gap-2" aria-label="Filtrar por modalidad">
        <Link
          href="/coaches"
          className={cn(
            "rounded-full border px-3 py-1 text-sm transition-colors",
            !activeModalidad
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-background hover:bg-accent"
          )}
        >
          Todas
        </Link>
        {MODALIDADES.map((m) => (
          <Link
            key={m.value}
            href={`/coaches?modalidad=${m.value}`}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              activeModalidad === m.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-background hover:bg-accent"
            )}
          >
            {m.label}
          </Link>
        ))}
      </nav>

      {publicCoaches.length === 0 ? (
        <div className="rounded-lg border bg-card p-8 text-center">
          <p className="text-muted-foreground">
            {activeModalidad
              ? `No hay entrenadores públicos en esta modalidad todavía. Prueba con otra o vuelve a "Todas".`
              : "Aún no hay perfiles publicados en el directorio. Si diriges una academia Zaltyko, puedes publicar el perfil de tus entrenadores desde el panel."}
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

