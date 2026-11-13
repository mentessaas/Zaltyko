import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ThemePreview } from "@/components/ui/theme-preview";

// Herramienta de desarrollo: nunca indexable y fuera de cualquier despliegue.
// robots.ts mantiene además `Disallow: /dev`.
export const metadata: Metadata = {
  title: "Vista previa del tema",
  robots: { index: false, follow: false, nocache: true },
};

export default function ThemePreviewPage() {
  // Solo en `next dev` local. Producción, staging y las previews de Vercel
  // (NODE_ENV=production o VERCEL_ENV definido) responden 404, como las
  // previews de /owner.
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL_ENV) notFound();
  return <ThemePreview />;
}
