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
      className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-white/10 bg-white/5 p-6 shadow-lg transition-all duration-300 hover:border-zaltyko-accent/40 hover:bg-white/10 hover:shadow-xl"
    >
      {/* Logo o placeholder */}
      <div className="mb-4 flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg bg-white/10">
        {academy.logoUrl ? (
          <Image
            src={academy.logoUrl}
            alt={`Logo de ${academy.name}`}
            width={80}
            height={80}
            className="h-full w-full object-cover"
          />
        ) : (
          <Calendar className="h-10 w-10 text-zaltyko-accent" />
        )}
      </div>

      {/* Nombre */}
      <h3 className="mb-2 font-display text-xl font-semibold text-white group-hover:text-zaltyko-accent-light transition-colors">
        {academy.name}
      </h3>

      {/* Tipo */}
      <span className="mb-3 inline-block rounded-full border border-zaltyko-accent/30 bg-zaltyko-accent/10 px-3 py-1 text-xs font-medium text-zaltyko-accent">
        {ACADEMY_TYPE_LABELS[academy.academyType] || academy.academyType}
      </span>

      {/* Ubicación */}
      {location && (
        <div className="mb-3 flex items-center gap-2 text-sm text-white/70">
          <MapPin className="h-4 w-4" />
          <span>{location}</span>
        </div>
      )}

      {/* Descripción (truncada) */}
      {academy.publicDescription && (
        <p className="mt-auto line-clamp-2 text-sm text-white/60">
          {academy.publicDescription}
        </p>
      )}

      {/* Flecha de hover */}
      <div className="absolute bottom-4 right-4 opacity-0 transition-opacity group-hover:opacity-100">
        <svg
          className="h-5 w-5 text-zaltyko-accent"
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
    </Link>
  );
}

