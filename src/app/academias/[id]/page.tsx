import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AcademyHero } from "@/components/public/AcademyHero";
import { AcademyInfo } from "@/components/public/AcademyInfo";
import { AcademySchedule } from "@/components/public/AcademySchedule";
import { ContactAcademyForm } from "@/components/public/ContactAcademyForm";
import { NearbyAcademies } from "@/components/public/NearbyAcademies";
import { getPublicAcademy } from "@/app/actions/public/get-public-academy";

interface AcademyDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: AcademyDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const academy = await getPublicAcademy(id);

  if (!academy) {
    return {
      title: "Academia no encontrada | Zaltyko",
    };
  }

  return {
    title: `${academy.name} | Directorio de Academias | Zaltyko`,
    description: academy.publicDescription || `Información sobre ${academy.name}`,
  };
}

export default async function AcademyDetailPage({ params }: AcademyDetailPageProps) {
  const { id } = await params;
  const academy = await getPublicAcademy(id);

  if (!academy) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-background">
      <AcademyHero academy={academy} />
      <AcademyInfo academy={academy} />
      <AcademySchedule schedule={academy.schedule} />

      {/* Sección de contacto */}
      <section className="border-b border-border py-12">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-border bg-card p-8 text-center shadow-sm">
            <h2 className="mb-4 font-display text-2xl font-semibold text-foreground">
              ¿Interesado en esta academia?
            </h2>
            <p className="mb-6 text-muted-foreground">
              Contacta con la academia para más información sobre clases, horarios y disponibilidad.
            </p>
            <ContactAcademyForm academyId={academy.id} academyName={academy.name} />
          </div>
        </div>
      </section>

      <NearbyAcademies
        currentAcademy={{
          id: academy.id,
          city: academy.city,
          region: academy.region,
          country: academy.country,
        }}
      />
    </div>
  );
}

