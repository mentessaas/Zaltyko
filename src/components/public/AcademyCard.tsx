import Image from "next/image";
import Link from "next/link";
import { MapPin, Calendar } from "lucide-react";

import type { PublicAcademy } from "@/app/actions/public/get-public-academies";

interface AcademyCardProps {
  academy: PublicAcademy;
}

const ACADEMY_TYPE_LABELS: Record<string, string> = {
  artistica: "Gimnasia Artística",
  ritmica: "Gimnasia Rítmica",
  trampolin: "Trampolín",
  general: "Gimnasia General",
  parkour: "Parkour",
  danza: "Danza",
};

export function AcademyCard({ academy }: AcademyCardProps) {
  const location = [academy.city, academy.region, academy.country]
    .filter(Boolean)
    .join(", ");

  return (
    <Link
      href={`/academias/${academy.id}`}
      className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card p-6 shadow-lg transition-all duration-300 hover:border-zaltyko-primary/50 hover:shadow-xl hover:shadow-zaltyko-primary/10"
    >
      {/* Logo o placeholder */}
      <div className="mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted shadow-sm transition-all group-hover:scale-105 group-hover:border-zaltyko-primary/50">
        {academy.logoUrl ? (
          <Image
            src={academy.logoUrl}
            alt={`Logo de ${academy.name}`}
            width={80}
            height={80}
            className="h-full w-full object-cover"
          />
        ) : (
          <Calendar className="h-10 w-10 text-zaltyko-primary" />
        )}
      </div>

      {/* Nombre */}
      <h3 className="mb-2 font-display text-xl font-semibold text-foreground transition-colors group-hover:text-zaltyko-primary">
        {academy.name}
      </h3>

      {/* Tipo */}
      <span className="mb-3 inline-block w-fit rounded-full border border-zaltyko-primary/30 bg-zaltyko-primary/10 px-3 py-1 text-xs font-medium text-zaltyko-primary">
        {ACADEMY_TYPE_LABELS[academy.academyType] || academy.academyType}
      </span>

      {/* Ubicación */}
      {location && (
        <div className="mb-3 flex items-center gap-2 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4 shrink-0 text-zaltyko-primary/70" />
          <span className="line-clamp-1">{location}</span>
        </div>
      )}

      {/* Descripción (truncada) */}
      {academy.publicDescription && (
        <p className="mt-auto line-clamp-2 text-sm leading-relaxed text-muted-foreground">
          {academy.publicDescription}
        </p>
      )}

      {/* Botón de acción */}
      <div className="mt-4 flex items-center justify-between pt-4 border-t border-border">
        <span className="text-xs font-medium text-muted-foreground transition-colors group-hover:text-zaltyko-primary">
          Ver detalles
        </span>
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-muted transition-all group-hover:border-zaltyko-primary/50 group-hover:bg-zaltyko-primary/10">
          <svg
            className="h-4 w-4 text-muted-foreground transition-all group-hover:text-zaltyko-primary group-hover:translate-x-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
      </div>
    </Link>
  );
}

