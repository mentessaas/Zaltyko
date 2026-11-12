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
    title: lang === "en" ? "About us" : "Sobre nosotros",
    description:
      lang === "en"
        ? "About Zaltyko: software for gymnastics academies."
        : "Sobre Zaltyko: software para academias de gimnasia.",
    robots: { index: true, follow: true },
  };
}

export default async function LocaleSobreNosotrosPage({ params }: PageProps) {
  const { locale } = await params;
  // Only the real locale prefixes are aliases; any other first segment is a
  // genuine 404 rather than a temporary redirect (SEO, 2026-11-12).
  if (!isValidLocale(locale)) {
    notFound();
  }
  permanentRedirect("/");
}