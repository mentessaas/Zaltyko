import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AcademyHero } from "@/components/public/AcademyHero";
import { AcademyInfo } from "@/components/public/AcademyInfo";
import { AcademySchedule } from "@/components/public/AcademySchedule";
import { ContactAcademyForm } from "@/components/public/ContactAcademyForm";
import { NearbyAcademies } from "@/components/public/NearbyAcademies";
import { getPublicAcademy } from "@/app/actions/public/get-public-academy";
import { getAcademyRobotsMetadata } from "@/lib/seo/academy-robots-directives";
import { getPublicSiteUrl } from "@/lib/seo/site-url";
import { Schema } from "@/components/Schema";

interface AcademyDetailPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: AcademyDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const academy = await getPublicAcademy(id);

  if (!academy) {
    return {
      title: "Academia no encontrada",
      robots: getAcademyRobotsMetadata(false),
    };
  }

  return {
    title: `${academy.name} | Directorio de Academias`,
    description: academy.publicDescription || `Información sobre ${academy.name}`,
    robots: getAcademyRobotsMetadata(true),
  };
}

export default async function AcademyDetailPage({ params }: AcademyDetailPageProps) {
  const { id } = await params;
  const academy = await getPublicAcademy(id);

  if (!academy) {
    notFound();
  }

  const baseUrl = getPublicSiteUrl();
  const academyUrl = `${baseUrl}/academias/${academy.id}`;

  const sameAs = [
    academy.website,
    academy.socialInstagram,
    academy.socialFacebook,
    academy.socialTwitter,
    academy.socialYoutube,
  ].filter((u): u is string => Boolean(u));

  const address =
    academy.address || academy.city || academy.region || academy.country
      ? {
          "@type": "PostalAddress",
          ...(academy.address && { streetAddress: academy.address }),
          ...(academy.city && { addressLocality: academy.city }),
          ...(academy.region && { addressRegion: academy.region }),
          ...(academy.country && { addressCountry: academy.country }),
        }
      : undefined;

  const localBusiness: Record<string, unknown> = {
    "@type": "LocalBusiness",
    "@id": academyUrl,
    name: academy.name,
    url: academy.website || academyUrl,
  };
  if (academy.publicDescription) localBusiness.description = academy.publicDescription;
  if (academy.logoUrl) localBusiness.image = academy.logoUrl;
  if (academy.contactEmail) localBusiness.email = academy.contactEmail;
  if (academy.contactPhone) localBusiness.telephone = academy.contactPhone;
  if (address) localBusiness.address = address;
  if (sameAs.length > 0) localBusiness.sameAs = sameAs;

  return (
    <>
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

      <Schema json={localBusiness} />

      <Schema
        json={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "Inicio",
              item: baseUrl,
            },
            {
              "@type": "ListItem",
              position: 2,
              name: "Academias",
              item: `${baseUrl}/academias`,
            },
            {
              "@type": "ListItem",
              position: 3,
              name: academy.name,
              item: academyUrl,
            },
          ],
        }}
      />
    </>
  );
}
