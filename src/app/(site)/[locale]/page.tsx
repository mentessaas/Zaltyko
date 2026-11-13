import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Locale } from "@/i18n";

const VALID_LOCALES = ["es", "en"] as const;

interface PageProps {
  params: Promise<{ locale: string }>;
}

function isValidLocale(locale: string): locale is Locale {
  return (VALID_LOCALES as readonly string[]).includes(locale);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const lang = isValidLocale(locale) ? locale : "es";
  return {
    title:
      lang === "en"
        ? "Zaltyko - Gymnastics academy management"
        : "Zaltyko - Sistema de Gestión para Academias de Gimnasia",
    description:
      lang === "en"
        ? "Software for gymnastics academy management."
        : "Sistema de gestión para academias de gimnasia.",
  };
}

export default async function LocaleHomePage({ params }: PageProps) {
  const { locale } = await params;
  // Solo /es y /en son alias de la portada. Cualquier otro primer segmento
  // (p. ej. /no-existe) es una ruta inexistente: 404 real, no un 307 a la
  // portada (soft 404 para buscadores y la página de error nunca se veía).
  if (!isValidLocale(locale)) {
    notFound();
  }
  permanentRedirect("/");
}