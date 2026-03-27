import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Locale } from "@/i18n";
import {
  MODALITIES,
  COUNTRIES,
  getClusterContent,
  getRelatedByModality,
  getRelatedByCountry,
  type ModalitySlug,
  type CountrySlug,
} from "@/lib/seo/clusters";
import { Schema } from "@/components/Schema";
import ClusterHeroSection from "@/components/landing/ClusterHeroSection";
import ClusterPainPointsSection from "@/components/landing/ClusterPainPointsSection";
import ClusterInterlinking from "@/components/landing/ClusterInterlinking";

const VALID_LOCALES = ["es", "en"] as const;
const VALID_MODALITIES = ["artistic", "rhythmic", "acrobatic", "trampoline"] as const;
const VALID_COUNTRIES = ["espana", "mexico", "argentina", "colombia", "chile", "peru"] as const;

interface ClusterPageProps {
  params: Promise<{
    locale: string;
    modality: string;
    country: string;
  }>;
}

// Generate static params for all clusters
export async function generateStaticParams() {
  const params: Array<{ locale: string; modality: string; country: string }> = [];

  for (const locale of VALID_LOCALES) {
    for (const modality of VALID_MODALITIES) {
      for (const country of VALID_COUNTRIES) {
        const modalitySlug = MODALITIES[modality][locale as Locale];
        const countrySlug = COUNTRIES[country][locale as Locale];
        params.push({
          locale,
          modality: modalitySlug,
          country: countrySlug,
        });
      }
    }
  }

  return params;
}

// Generate metadata for each cluster
export async function generateMetadata({
  params,
}: ClusterPageProps): Promise<Metadata> {
  const { locale, modality, country } = await params;

  // Find the modality and country keys
  const modalityKey = Object.keys(MODALITIES).find(
    (key) => MODALITIES[key as ModalitySlug][locale as Locale] === modality
  ) as ModalitySlug | undefined;

  const countryKey = Object.keys(COUNTRIES).find(
    (key) => COUNTRIES[key as CountrySlug][locale as Locale] === country
  ) as CountrySlug | undefined;

  if (!modalityKey || !countryKey) {
    return {
      title: "Cluster Not Found",
    };
  }

  const content = await getClusterContent(locale as Locale, modalityKey, countryKey);

  if (!content) {
    return {
      title: "Cluster Not Found",
    };
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://zaltyko.com";
  const canonicalUrl = `${baseUrl}/${locale}/${modality}/${country}`;

  return {
    title: content.meta.title,
    description: content.meta.description,
    keywords: content.meta.keywords,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: content.meta.title,
      description: content.meta.description,
      url: canonicalUrl,
      siteName: "Zaltyko",
      locale: locale === "es" ? "es_ES" : "en_US",
      type: "website",
    },
    other: {
      "article:modified_time": new Date().toISOString(),
    },
  };
}

export default async function ClusterPage({ params }: ClusterPageProps) {
  const { locale, modality, country } = await params;

  // Validate locale
  if (!VALID_LOCALES.includes(locale as (typeof VALID_LOCALES)[number])) {
    notFound();
  }

  // Find the modality and country keys
  const modalityKey = Object.keys(MODALITIES).find(
    (key) => MODALITIES[key as ModalitySlug][locale as Locale] === modality
  ) as ModalitySlug | undefined;

  const countryKey = Object.keys(COUNTRIES).find(
    (key) => COUNTRIES[key as CountrySlug][locale as Locale] === country
  ) as CountrySlug | undefined;

  if (!modalityKey || !countryKey) {
    notFound();
  }

  // Get cluster content
  const content = await getClusterContent(locale as Locale, modalityKey, countryKey);

  if (!content) {
    notFound();
  }

  // Get related clusters
  const relatedByModality = getRelatedByModality(locale as Locale, modalityKey, countryKey, 4);
  const relatedByCountry = getRelatedByCountry(locale as Locale, countryKey, modalityKey, 4);

  // Get labels
  const modalityLabel = MODALITIES[modalityKey].label[locale as Locale];
  const countryLabel = COUNTRIES[countryKey].label[locale as Locale];

  // URL info for schema
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://zaltyko.com";
  const canonicalUrl = `${baseUrl}/${locale}/${modality}/${country}`;

  // BreadcrumbList schema
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: locale === "es" ? "Inicio" : "Home",
        item: `${baseUrl}/${locale}`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: modalityLabel,
        item: `${baseUrl}/${locale}/${modality}`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: countryLabel,
        item: canonicalUrl,
      },
    ],
  };

  return (
    <>
      <Schema json={breadcrumbSchema} />
      <ClusterHeroSection
        content={content}
        locale={locale as "es" | "en"}
        modalityLabel={modalityLabel}
        countryLabel={countryLabel}
        modalitySlug={modality}
        countrySlug={country}
      />

      <ClusterPainPointsSection content={content} locale={locale as "es" | "en"} />

      <ClusterInterlinking
        locale={locale as "es" | "en"}
        modality={modalityKey}
        country={countryKey}
        modalityLabel={modalityLabel}
        countryLabel={countryLabel}
        relatedByModality={relatedByModality}
        relatedByCountry={relatedByCountry}
        federationName={content.federation.name}
        competitions={content.federation.competitions}
      />
    </>
  );
}
