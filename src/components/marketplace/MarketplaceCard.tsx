"use client";

import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dumbbell, MapPin, Star } from "lucide-react";
import { formatMinorCurrency } from "@/lib/currency";

export interface MarketplaceListingCard {
  id: string;
  title: string;
  type: string;
  category: string;
  priceCents?: number | null;
  currency?: string | null;
  priceType: string;
  images?: string[] | null;
  location?: { city: string; country: string } | null;
  isFeatured?: boolean | null;
  sellerType?: string | null;
}

interface MarketplaceCardProps {
  listing: MarketplaceListingCard;
  sellerRating?: number;
}

export function MarketplaceCard({ listing, sellerRating }: MarketplaceCardProps) {
  const priceDisplay =
    listing.priceType === "contact"
      ? "Consultar"
      : listing.priceType === "negotiable" && listing.priceCents == null
        ? "A convenir"
        : listing.priceCents != null
          ? formatMinorCurrency(listing.priceCents, listing.currency ?? "EUR")
          : "Consultar";

  const categoryLabels: Record<string, string> = {
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

  return (
    <Link href={`/marketplace/${listing.id}`}>
      <Card className="overflow-hidden hover:shadow-lg transition-shadow">
        <div className="aspect-[4/3] relative overflow-hidden bg-muted">
          {listing.images?.[0] ? (
            <Image
              src={listing.images[0]}
              alt={listing.title}
              fill
              className="object-cover"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 bg-gradient-to-br from-teal-50 via-slate-50 to-cyan-50 text-slate-500">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/80 bg-white/75 text-teal-700 shadow-sm">
                <Dumbbell className="h-7 w-7" aria-hidden="true" />
              </span>
              <span className="text-xs font-medium tracking-wide text-slate-500">
                {listing.type === "product" ? "Producto de gimnasia" : "Servicio para tu academia"}
              </span>
            </div>
          )}
          {listing.isFeatured && (
            <Badge className="absolute top-2 right-2 bg-yellow-500">
              Destacado
            </Badge>
          )}
        </div>
        <CardHeader className="p-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline">{listing.type === "product" ? "Producto" : "Servicio"}</Badge>
            <Badge variant="default">{categoryLabels[listing.category] || listing.category}</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-3 pt-0">
          <h3 className="font-semibold line-clamp-2">{listing.title}</h3>
          <p className="text-lg font-bold text-primary mt-1">{priceDisplay}</p>
          {listing.location && (
            <div className="flex items-center gap-1 text-sm text-gray-500 mt-1">
              <MapPin className="w-3 h-3" />
              {listing.location.city}, {listing.location.country}
            </div>
          )}
        </CardContent>
        <CardFooter className="p-3 pt-0 flex items-center justify-between">
          {sellerRating && (
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
              <span className="text-sm">{sellerRating.toFixed(1)}</span>
            </div>
          )}
        </CardFooter>
      </Card>
    </Link>
  );
}
