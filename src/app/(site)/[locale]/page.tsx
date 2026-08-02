import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Locale } from "@/i18n";
import { buildUtmRedirectTarget } from "@/lib/gtm/utm";

const VALID_LOCALES = ["es", "en"] as const;

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function isValidLocale(locale: string): locale is Locale {
  return (VALID_LOCALES as readonly string[]).includes(locale);
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
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

export default async function LocaleHomePage({
  params,
  searchParams,
}: PageProps) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  const destination = buildUtmRedirectTarget(query, `/${locale}`);
  if (!isValidLocale(locale)) {
    redirect(destination);
  }
  redirect(destination);
}
