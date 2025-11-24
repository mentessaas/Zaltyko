import Image from "next/image";
import { MapPin, Calendar } from "lucide-react";
import type { PublicAcademyDetail } from "@/app/actions/public/get-public-academy";

interface AcademyHeroProps {
  academy: PublicAcademyDetail;
}

const ACADEMY_TYPE_LABELS: Record<string, string> = {
  artistica: "Gimnasia Artística",
  ritmica: "Gimnasia Rítmica",
  trampolin: "Trampolín",
  general: "Gimnasia General",
  parkour: "Parkour",
  danza: "Danza",
};

export function AcademyHero({ academy }: AcademyHeroProps) {
  const location = [academy.city, academy.region, academy.country]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="border-b border-border bg-gradient-to-br from-zaltyko-primary-light/30 via-zaltyko-primary-light/20 to-transparent py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center">
          {/* Logo */}
          <div className="flex h-32 w-32 items-center justify-center overflow-hidden rounded-xl border border-border bg-card shadow-sm md:h-40 md:w-40">
            {academy.logoUrl ? (
              <Image
                src={academy.logoUrl}
                alt={`Logo de ${academy.name}`}
                width={160}
                height={160}
                className="h-full w-full object-cover"
              />
            ) : (
              <Calendar className="h-16 w-16 text-zaltyko-primary md:h-20 md:w-20" />
            )}
          </div>

          {/* Información */}
          <div className="flex-1">
            <h1 className="font-display text-3xl font-bold text-foreground sm:text-4xl">
              {academy.name}
            </h1>

            <div className="mt-4 flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-2 rounded-full border border-zaltyko-primary/30 bg-zaltyko-primary/10 px-4 py-1.5 text-sm font-medium text-zaltyko-primary">
                {ACADEMY_TYPE_LABELS[academy.academyType] || academy.academyType}
              </span>

              {location && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <MapPin className="h-4 w-4" />
                  <span>{location}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

