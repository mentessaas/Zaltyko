import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Phone, Mail } from "lucide-react";
import { AdBanner } from "@/components/advertising/AdBanner";

interface Props {
  params: Promise<{ id: string }>;
}

async function getListing(id: string) {
  const res = await fetch(`${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/api/marketplace/${id}`, {
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
  if (!data?.item) return { title: "Listing no encontrado" };
  return {
    title: `${data.item.title} | Marketplace Zaltyko`,
    description: data.item.description,
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  equipment: "Equipamiento",
  clothing: "Ropa",
  supplements: "Suplementos",
  books: "Libros",
  particular_training: "Clases particulares",
  personal_training: "Entrenamiento personal",
  clinics: "Clínicas",
  arbitration: "Arbitraje",
  physiotherapy: "Fisioterapia",
  photography: "Fotografía",
  other: "Otro",
};

const TYPE_LABELS: Record<string, string> = {
  product: "Producto",
  service: "Servicio",
};

const SELLER_TYPE_LABELS: Record<string, string> = {
  academy: "Academia",
  coach: "Entrenador",
  athlete: "Atleta",
  external: "Vendedor externo",
};

export default async function MarketplaceDetailPage({ params }: Props) {
  const { id } = await params;
  const data = await getListing(id);
  const { ads: topAds } = await getAds("marketplace_top");

  if (!data?.item) {
    notFound();
  }

  const listing = data.item;

  const formatPrice = (cents: number, priceType: string) => {
    if (priceType === "contact") return "Consultar";
    const euros = cents / 100;
    return new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(euros);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <Link
        href="/marketplace"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-primary mb-6"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Volver al marketplace
      </Link>

      <AdBanner ads={topAds} position="top" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <span className="inline-block px-3 py-1 text-xs font-medium bg-primary/10 text-primary rounded-full mb-2">
                  {TYPE_LABELS[listing.type] || listing.type}
                </span>
                <span className="inline-block px-3 py-1 text-xs font-medium bg-secondary/10 text-secondary-foreground rounded-full ml-2">
                  {CATEGORY_LABELS[listing.category] || listing.category}
                </span>
              </div>
              {listing.isFeatured && (
                <span className="px-3 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                  Destacado
                </span>
              )}
            </div>

            <h1 className="text-3xl font-bold mb-4">{listing.title}</h1>

            <p className="text-3xl font-bold text-primary mb-6">
              {formatPrice(listing.priceCents || 0, listing.priceType)}
              {listing.priceType === "negotiable" && <span className="text-lg font-normal text-muted-foreground ml-2">(negociable)</span>}
            </p>

            {listing.description && (
              <div className="prose max-w-none mb-6">
                <h2 className="text-lg font-semibold mb-2">Descripción</h2>
                <p className="whitespace-pre-wrap">{listing.description}</p>
              </div>
            )}

            {listing.images && listing.images.length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-semibold mb-2">Imágenes</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {listing.images.map((img: string, idx: number) => (
                    <img
                      key={idx}
                      src={img}
                      alt={`${listing.title} - imagen ${idx + 1}`}
                      className="w-full h-40 object-cover rounded-lg"
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="bg-white rounded-lg border p-6 sticky top-24">
            <h2 className="font-semibold mb-4">Información del vendedor</h2>

            <div className="space-y-3 text-sm">
              <p>
                <span className="text-muted-foreground">Tipo: </span>
                <span className="font-medium">{SELLER_TYPE_LABELS[listing.sellerType] || listing.sellerType}</span>
              </p>

              {listing.location && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <span>
                    {listing.location.city}
                    {listing.location.province && `, ${listing.location.province}`}
                    {listing.location.country && `, ${listing.location.country}`}
                  </span>
                </div>
              )}
            </div>

            {listing.contact && (
              <div className="mt-6 pt-6 border-t">
                <h3 className="font-medium mb-3">Contacto</h3>
                <div className="space-y-2">
                  {listing.contact.whatsapp && (
                    <a
                      href={`https://wa.me/${listing.contact.whatsapp.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-sm text-green-600 hover:underline"
                    >
                      <Phone className="h-4 w-4" />
                      WhatsApp
                    </a>
                  )}
                  {listing.contact.phone && (
                    <a
                      href={`tel:${listing.contact.phone}`}
                      className="flex items-center gap-2 text-sm hover:underline"
                    >
                      <Phone className="h-4 w-4" />
                      {listing.contact.phone}
                    </a>
                  )}
                  {listing.contact.email && (
                    <a
                      href={`mailto:${listing.contact.email}`}
                      className="flex items-center gap-2 text-sm hover:underline"
                    >
                      <Mail className="h-4 w-4" />
                      {listing.contact.email}
                    </a>
                  )}
                </div>
              </div>
            )}

            {listing.priceType !== "contact" && (
              <div className="mt-6">
                <p className="text-xs text-muted-foreground">
                  Visto {listing.views || 0} veces
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
