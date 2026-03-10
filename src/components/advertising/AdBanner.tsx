"use client";

import Link from "next/link";
import Image from "next/image";

interface AdBannerProps {
  ads: Array<{
    id: string;
    type: string;
    imageUrl?: string;
    linkUrl: string;
    title: string;
    altText?: string;
  }>;
  position: "top" | "sidebar" | "between";
}

export function AdBanner({ ads, position }: AdBannerProps) {
  if (!ads || ads.length === 0) return null;

  const banner = ads[0]; // Mostrar primer anuncio activo

  if (position === "sidebar") {
    return (
      <Link href={banner.linkUrl} target="_blank" className="block">
        {banner.imageUrl ? (
          <Image
            src={banner.imageUrl}
            alt={banner.altText || banner.title}
            width={300}
            height={250}
            className="rounded-lg"
          />
        ) : (
          <div className="w-[300px] h-[250px] bg-gray-100 rounded-lg flex items-center justify-center">
            <span className="text-gray-400">Publicidad</span>
          </div>
        )}
      </Link>
    );
  }

  return (
    <Link href={banner.linkUrl} target="_blank" className="block my-4">
      {banner.imageUrl ? (
        <Image
          src={banner.imageUrl}
          alt={banner.altText || banner.title}
          width={970}
          height={90}
          className="rounded-lg w-full"
        />
      ) : (
        <div className="w-full h-[90px] bg-gray-100 rounded-lg flex items-center justify-center">
          <span className="text-gray-400">Publicidad</span>
        </div>
      )}
    </Link>
  );
}
