import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Calendar, Briefcase, Building } from "lucide-react";
import { AdBanner } from "@/components/advertising/AdBanner";

interface Props {
  params: Promise<{ id: string }>;
}

async function getListing(id: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/api/empleo/${id}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return res.json();
}

async function getAds(zone: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/api/advertising/zones/${zone}`, {
    cache: "no-store",
  });
  return res.json();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const data = await getListing(id);
  if (!data?.item) return { title: "Puesto no encontrado" };
  return {
    title: `${data.item.title} | Bolsa de Empleo Zaltyko`,
    description: data.item.description,
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  coach: "Entrenador",
  assistant_coach: "Asistente de Entrenador",
  administrative: "Administrativo",
  physiotherapist: "Fisioterapeuta",
  psychologist: "Psicólogo Deportivo",
  other: "Otro",
};

const JOB_TYPE_LABELS: Record<string, string> = {
  full_time: "Jornada Completa",
  part_time: "Media Jornada",
  internship: "Prácticas",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Activa",
  closed: "Cerrada",
  draft: "Borrador",
};

export default async function EmpleoDetailPage({ params }: Props) {
  const { id } = await params;
  const data = await getListing(id);
  const { ads: topAds } = await getAds("empleo_top");

  if (!data?.item) {
    notFound();
  }

  const listing = data.item;

  const formatSalary = (salary: any) => {
    if (!salary || salary.type === "contact") return "A consultar";
    if (salary.type === "fixed" && salary.min) {
      return `${salary.min}€/mes`;
    }
    if (salary.type === "range" && salary.min && salary.max) {
      return `${salary.min}€ - ${salary.max}€/mes`;
    }
    return "A consultar";
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Link
        href="/empleo"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-6"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Volver a la bolsa de empleo
      </Link>

      <AdBanner ads={topAds} position="top" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className="inline-block px-3 py-1 text-xs font-medium bg-primary/10 text-primary rounded-full mb-2">
                  {CATEGORY_LABELS[listing.category] || listing.category}
                </span>
                <span className="inline-block px-3 py-1 text-xs font-medium bg-secondary/10 text-secondary-foreground rounded-full ml-2">
                  {JOB_TYPE_LABELS[listing.jobType] || listing.jobType}
                </span>
              </div>
              <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                listing.status === "active" ? "bg-green-100 text-green-800" :
                listing.status === "closed" ? "bg-red-100 text-red-800" :
                "bg-gray-100 text-gray-800"
              }`}>
                {STATUS_LABELS[listing.status] || listing.status}
              </span>
            </div>

            <h1 className="text-3xl font-bold mb-4">{listing.title}</h1>

            <div className="flex flex-wrap gap-4 text-sm text-muted-foreground mb-6">
              {listing.location && (
                <div className="flex items-center gap-1">
                  <MapPin className="h-4 w-4" />
                  {listing.location.city}
                  {listing.location.province && `, ${listing.location.province}`}
                </div>
              )}
              <div className="flex items-center gap-1">
                <Briefcase className="h-4 w-4" />
                {formatSalary(listing.salary)}
              </div>
              {listing.deadline && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" />
                  Hasta el {formatDate(listing.deadline)}
                </div>
              )}
            </div>

            {listing.description && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-2">Descripción</h2>
                <p className="whitespace-pre-wrap">{listing.description}</p>
              </div>
            )}

            {listing.requirements && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-2">Requisitos</h2>
                <p className="whitespace-pre-wrap">{listing.requirements}</p>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="bg-white rounded-lg border p-6 sticky top-24">
            <h2 className="font-semibold mb-4">Información del puesto</h2>

            <div className="space-y-3 text-sm">
              {listing.academyId && (
                <div className="flex items-start gap-2">
                  <Building className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <span>Academia verificada</span>
                </div>
              )}

              <p>
                <span className="text-muted-foreground">Categoría: </span>
                <span className="font-medium">{CATEGORY_LABELS[listing.category] || listing.category}</span>
              </p>

              <p>
                <span className="text-muted-foreground">Tipo: </span>
                <span className="font-medium">{JOB_TYPE_LABELS[listing.jobType] || listing.jobType}</span>
              </p>

              <p>
                <span className="text-muted-foreground">Salario: </span>
                <span className="font-medium">{formatSalary(listing.salary)}</span>
              </p>

              {listing.deadline && (
                <p>
                  <span className="text-muted-foreground">Fecha límite: </span>
                  <span className="font-medium">{formatDate(listing.deadline)}</span>
                </p>
              )}
            </div>

            <div className="mt-6 pt-6 border-t">
              {listing.status === "active" && (
                <>
                  {listing.howToApply === "external" && listing.externalUrl ? (
                    <a
                      href={listing.externalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full text-center bg-primary text-white py-2 px-4 rounded-lg hover:bg-primary/90"
                    >
                      Aplicar ahora
                    </a>
                  ) : (
                    <Link
                      href={`/empleo/${id}/aplicar`}
                      className="block w-full text-center bg-primary text-white py-2 px-4 rounded-lg hover:bg-primary/90"
                    >
                      Aplicar a este puesto
                    </Link>
                  )}
                </>
              )}

              {listing.status !== "active" && (
                <p className="text-center text-muted-foreground">
                  Esta oferta ya no está disponible
                </p>
              )}

              <p className="text-xs text-muted-foreground text-center mt-4">
                Visto {listing.views || 0} veces
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
