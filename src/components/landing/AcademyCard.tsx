"use client";

import Link from "next/link";
import { MapPin, Globe, Instagram } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { PublicAcademy } from "@/lib/seo/clusters";

interface AcademyCardProps {
  academy: PublicAcademy;
  locale: "es" | "en";
}

export default function AcademyCard({ academy, locale }: AcademyCardProps) {
  const labels = {
    es: {
      viewDetails: "Ver detalles",
      visitWebsite: "Visitar web",
    },
    en: {
      viewDetails: "View details",
      visitWebsite: "Visit website",
    },
  };

  const t = labels[locale];

  return (
    <Card className="group h-full overflow-hidden border border-gray-100 bg-white transition-all duration-300 hover:shadow-lg hover:border-red-100 hover:-translate-y-1">
      <CardContent className="p-5">
        {/* Logo and Name */}
        <div className="flex items-start gap-4 mb-4">
          {academy.logoUrl ? (
            <div className="w-14 h-14 rounded-xl overflow-hidden bg-gray-50 flex-shrink-0">
              <img
                src={academy.logoUrl}
                alt={academy.name}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-red-50 to-rose-50 flex items-center justify-center flex-shrink-0">
              <span className="text-2xl font-bold text-red-600">
                {academy.name.charAt(0)}
              </span>
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900 text-lg leading-tight truncate">
              {academy.name}
            </h3>
            {(academy.city || academy.region) && (
              <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                <MapPin className="h-3 w-3 flex-shrink-0" />
                {[academy.city, academy.region].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
        </div>

        {/* Description */}
        {academy.publicDescription && (
          <p className="text-sm text-gray-600 line-clamp-3 mb-4">
            {academy.publicDescription}
          </p>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-3 border-t border-gray-100">
          {academy.website && (
            <a
              href={academy.website}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700 transition-colors"
            >
              <Globe className="h-4 w-4" />
              {t.visitWebsite}
            </a>
          )}
          {academy.socialInstagram && (
            <a
              href={`https://instagram.com/${academy.socialInstagram.replace("@", "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-pink-600 transition-colors ml-auto"
            >
              <Instagram className="h-4 w-4" />
              @{academy.socialInstagram.replace("@", "")}
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
