import Link from "next/link";
import { MapPin } from "lucide-react";
import { AcademyCard } from "./AcademyCard";
import { getPublicAcademies } from "@/app/actions/public/get-public-academies";
import type { PublicAcademy } from "@/app/actions/public/get-public-academies";

interface NearbyAcademiesProps {
  currentAcademy: {
    id: string;
    city: string | null;
    region: string | null;
    country: string | null;
  };
}

export async function NearbyAcademies({ currentAcademy }: NearbyAcademiesProps) {
  // Buscar academias en la misma ciudad, región o país
  const filters: any = {
    page: 1,
    limit: 6,
  };

  if (currentAcademy.city) {
    filters.city = currentAcademy.city;
  } else if (currentAcademy.region) {
    filters.region = currentAcademy.region;
  } else if (currentAcademy.country) {
    filters.country = currentAcademy.country;
  }

  const result = await getPublicAcademies(filters);
  
  // Excluir la academia actual
  const nearbyAcademies = result.items.filter((a) => a.id !== currentAcademy.id).slice(0, 3);

  if (nearbyAcademies.length === 0) {
    return null;
  }

  return (
    <section className="py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-3">
          <MapPin className="h-6 w-6 text-zaltyko-primary" />
          <h2 className="font-display text-2xl font-semibold text-foreground">
            Academias cercanas
          </h2>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {nearbyAcademies.map((academy) => (
            <AcademyCard key={academy.id} academy={academy} />
          ))}
        </div>
      </div>
    </section>
  );
}

