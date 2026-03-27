import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, MapPin, Users, Trophy } from "lucide-react";
import { Locale } from "@/i18n";
import {
  MODALITIES,
  COUNTRIES,
  getCountriesForModality,
  type ModalitySlug,
  type CountrySlug,
} from "@/lib/seo/clusters";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const VALID_LOCALES = ["es", "en"] as const;
const VALID_MODALITIES = ["artistic", "rhythmic", "acrobatic", "trampoline"] as const;

interface ModalityPageProps {
  params: Promise<{
    locale: string;
    modality: string;
  }>;
}

// Generate static params for all modality pages
export async function generateStaticParams() {
  const params: Array<{ locale: string; modality: string }> = [];

  for (const locale of VALID_LOCALES) {
    for (const modality of VALID_MODALITIES) {
      const modalitySlug = MODALITIES[modality][locale as Locale];
      params.push({
        locale,
        modality: modalitySlug,
      });
    }
  }

  return params;
}

// Generate metadata for each modality page
export async function generateMetadata({
  params,
}: ModalityPageProps): Promise<Metadata> {
  const { locale, modality } = await params;

  const modalityKey = Object.keys(MODALITIES).find(
    (key) => MODALITIES[key as ModalitySlug][locale as Locale] === modality
  ) as ModalitySlug | undefined;

  if (!modalityKey) {
    return { title: "Modality Not Found" };
  }

  const modalityLabel = MODALITIES[modalityKey].label[locale as Locale];
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://zaltyko.com";
  const canonicalUrl = `${baseUrl}/${locale}/${modality}`;

  const titles = {
    es: {
      title: `${modalityLabel} en Latinoamérica | Zaltyko`,
      description: `Encuentra academias de ${modalityLabel.toLowerCase()} en España, México, Argentina, Colombia, Chile y Perú. Software de gestión especializado.`,
    },
    en: {
      title: `${modalityLabel} in Latin America | Zaltyko`,
      description: `Find ${modalityLabel.toLowerCase()} academies in Spain, Mexico, Argentina, Colombia, Chile and Peru. Specialized management software.`,
    },
  };

  const t = titles[locale as "es" | "en"];

  return {
    title: t.title,
    description: t.description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: t.title,
      description: t.description,
      url: canonicalUrl,
      siteName: "Zaltyko",
      locale: locale === "es" ? "es_ES" : "en_US",
      type: "website",
    },
  };
}

export default async function ModalityPage({ params }: ModalityPageProps) {
  const { locale, modality } = await params;

  // Validate locale
  if (!VALID_LOCALES.includes(locale as (typeof VALID_LOCALES)[number])) {
    notFound();
  }

  // Find the modality key
  const modalityKey = Object.keys(MODALITIES).find(
    (key) => MODALITIES[key as ModalitySlug][locale as Locale] === modality
  ) as ModalitySlug | undefined;

  if (!modalityKey) {
    notFound();
  }

  // Get all countries for this modality
  const countries = getCountriesForModality(locale as Locale, modalityKey);
  const modalityLabel = MODALITIES[modalityKey].label[locale as Locale];

  const labels = {
    es: {
      title: `${modalityLabel} por país`,
      subtitle: "Encuentra la academia perfecta para ti",
      cta: "Crear academia gratis",
      otherModalities: "Ver otras modalidades",
    },
    en: {
      title: `${modalityLabel} by country`,
      subtitle: "Find the perfect academy for you",
      cta: "Create free academy",
      otherModalities: "View other modalities",
    },
  };

  const t = labels[locale as "es" | "en"];

  // Get other modalities for the footer link
  const otherModalities = Object.keys(MODALITIES)
    .filter((key) => key !== modalityKey)
    .map((key) => ({
      slug: key,
      label: MODALITIES[key as ModalitySlug].label[locale as Locale],
      url: `/${locale}/${MODALITIES[key as ModalitySlug][locale as Locale]}`,
    }));

  return (
    <>
      {/* Hero */}
      <section className="relative min-h-[50vh] flex items-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-red-50">
        <div className="absolute inset-0">
          <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-gradient-to-br from-red-100/50 via-rose-50/30 to-transparent rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-gradient-to-tr from-red-50/80 via-pink-50/40 to-transparent rounded-full blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20">
          <div className="max-w-2xl">
            <nav className="mb-6 text-sm">
              <ol className="flex items-center gap-2 text-gray-500">
                <li>
                  <Link href={`/${locale}`} className="hover:text-red-600 transition-colors">
                    {locale === "es" ? "Inicio" : "Home"}
                  </Link>
                </li>
                <li className="mx-1">/</li>
                <li className="text-gray-900 font-medium">{modalityLabel}</li>
              </ol>
            </nav>

            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-4">
              {t.title}
            </h1>
            <p className="text-xl text-gray-600 mb-8">{t.subtitle}</p>
            <Link
              href="/onboarding"
              className={cn(
                buttonVariants({ variant: "default", size: "lg" }),
                "bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/25 hover:shadow-red-600/40 transition-all duration-300 text-base px-8 py-6 group inline-flex items-center"
              )}
            >
              {t.cta}
              <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      {/* Countries Grid */}
      <section className="py-20 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {countries.map((country) => (
              <Link
                key={country.slug}
                href={country.url}
                className="group bg-gray-50 hover:bg-red-50 rounded-2xl p-6 border border-gray-100 hover:border-red-100 transition-all duration-300"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-semibold text-gray-900 text-lg group-hover:text-red-700 transition-colors">
                      {country.label}
                    </h3>
                    <p className="text-sm text-gray-500 capitalize">{modalityLabel}</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-red-500 transition-colors" />
                </div>

                <div className="flex items-center gap-4 text-sm text-gray-600">
                  <span className="flex items-center gap-1">
                    <Users className="h-4 w-4" />
                    {COUNTRIES[country.slug].code}
                  </span>
                  <span className="flex items-center gap-1">
                    <Trophy className="h-4 w-4" />
                    RFEG
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Other Modalities */}
      <section className="py-12 bg-gray-50 border-t border-gray-100">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{t.otherModalities}</p>
            <div className="flex gap-3">
              {otherModalities.map((mod) => (
                <Link
                  key={mod.slug}
                  href={mod.url}
                  className="text-sm font-medium text-gray-700 hover:text-red-600 transition-colors"
                >
                  {mod.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
