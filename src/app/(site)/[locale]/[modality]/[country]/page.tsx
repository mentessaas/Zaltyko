import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Locale } from "@/i18n";
import {
  MODALITIES,
  COUNTRIES,
  AVAILABLE_MODALITIES,
  getClusterContent,
  getClusterAcademies,
  getRelatedByModality,
  getRelatedByCountry,
  getClusterHreflang,
  generateClusterJsonLd,
  type ModalitySlug,
  type CountrySlug,
} from "@/lib/seo/clusters";
import { Schema } from "@/components/Schema";
import ClusterHeroSection from "@/components/landing/ClusterHeroSection";
import ClusterPainPointsSection from "@/components/landing/ClusterPainPointsSection";
import ClusterInterlinking from "@/components/landing/ClusterInterlinking";
import { getPublicSiteUrl } from "@/lib/seo/site-url";

const VALID_LOCALES = ["es", "en"] as const;
const VALID_MODALITIES = Object.keys(MODALITIES) as ModalitySlug[];
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
        if (!modalitySlug || !countrySlug) continue;
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

  const baseUrl = getPublicSiteUrl();
  const canonicalUrl = `${baseUrl}/${locale}/${modality}/${country}`;

  return {
    title: content.meta.title,
    description: content.meta.description,
    keywords: content.meta.keywords,
    alternates: {
      canonical: canonicalUrl,
      languages: getClusterHreflang(modalityKey, countryKey, baseUrl),
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
  const available = AVAILABLE_MODALITIES[modalityKey];

  // URL info for schema
  const baseUrl = getPublicSiteUrl();
  const canonicalUrl = `${baseUrl}/${locale}/${modality}/${country}`;

  // Pull the public academy list for this cluster (12-item cap, same query
  // the future directory UI will use). Items feed the ItemList node of the
  // cluster JSON-LD; rendered output is unchanged.
  const academyRows = await getClusterAcademies(locale as Locale, modalityKey, countryKey, 12);
  const academiesForSchema = academyRows.map((row) => ({
    id: row.id,
    name: row.name,
    city: row.city,
    region: row.region,
  }));

  // W6 GEO audit: emit the unified cluster schema (WebPage + BreadcrumbList
  // + ItemList of academies when available) instead of the previous inline
  // BreadcrumbList-only block.
  const clusterSchema = generateClusterJsonLd({
    baseUrl,
    locale: locale as "es" | "en",
    modalityLabel,
    modalitySlug: modality,
    countryLabel,
    countrySlug: country,
    pageTitle: content.meta.title,
    pageDescription: content.meta.description,
    academies: academiesForSchema,
  });

  return (
    <>
      <Schema json={clusterSchema} />
      <ClusterHeroSection
        content={content}
        locale={locale as "es" | "en"}
        modalityLabel={modalityLabel}
        countryLabel={countryLabel}
        modalitySlug={modality}
        countrySlug={country}
        available={available}
      />

      <ClusterPainPointsSection content={content} locale={locale as "es" | "en"} available={available} />

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
        available={available}
      />
    </>
  );
}
