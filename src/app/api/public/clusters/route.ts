import { NextResponse } from "next/server";
import { z } from "zod";

import {
  MODALITIES,
  COUNTRIES,
  getClusterAcademies,
  getClusterCoaches,
  getClusterEvents,
  type ModalitySlug,
  type CountrySlug,
} from "@/lib/seo/clusters";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  locale: z.enum(["es", "en"]).optional().default("es"),
  modality: z.string().optional(),
  country: z.string().optional(),
  type: z.enum(["academies", "coaches", "events", "all"]).optional().default("all"),
  limit: z.coerce.number().min(1).max(100).optional().default(12),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const queryParams = querySchema.safeParse(Object.fromEntries(url.searchParams));

    if (!queryParams.success) {
      return NextResponse.json(
        { error: "Invalid query parameters", details: queryParams.error.flatten() },
        { status: 400 }
      );
    }

    const { locale, modality, country, type, limit } = queryParams.data;

    // If modality and country are provided, validate them
    let modalityKey: ModalitySlug | null = null;
    let countryKey: CountrySlug | null = null;

    if (modality && country) {
      // Find modality key
      for (const key of Object.keys(MODALITIES) as ModalitySlug[]) {
        if (MODALITIES[key][locale] === modality) {
          modalityKey = key;
          break;
        }
      }

      // Find country key
      for (const key of Object.keys(COUNTRIES) as CountrySlug[]) {
        if (COUNTRIES[key][locale] === country) {
          countryKey = key;
          break;
        }
      }

      if (!modalityKey || !countryKey) {
        return NextResponse.json(
          { error: "Invalid modality or country" },
          { status: 400 }
        );
      }

      // Get data based on type
      const results: Record<string, unknown> = {};

      if (type === "academies" || type === "all") {
        results.academies = await getClusterAcademies(locale, modalityKey, countryKey, limit);
      }

      if (type === "coaches" || type === "all") {
        results.coaches = await getClusterCoaches(locale, modalityKey, countryKey, limit);
      }

      if (type === "events" || type === "all") {
        results.events = await getClusterEvents(locale, modalityKey, countryKey, limit);
      }

      return NextResponse.json({
        locale,
        modality,
        country,
        modalityKey,
        countryKey,
        ...results,
      });
    }

    // Return available clusters (no specific data)
    const availableClusters: Array<{
      modality: ModalitySlug;
      country: CountrySlug;
      url: string;
      label: string;
    }> = [];

    for (const modKey of Object.keys(MODALITIES) as ModalitySlug[]) {
      for (const countryKey of Object.keys(COUNTRIES) as CountrySlug[]) {
        const modalitySlug = MODALITIES[modKey][locale];
        const countrySlug = COUNTRIES[countryKey][locale];

        if (modalitySlug && countrySlug) {
          availableClusters.push({
            modality: modKey,
            country: countryKey,
            url: `/${locale}/${modalitySlug}/${countrySlug}`,
            label: `${MODALITIES[modKey].label[locale]} - ${COUNTRIES[countryKey].label[locale]}`,
          });
        }
      }
    }

    return NextResponse.json({
      locale,
      availableClusters,
      modalities: Object.keys(MODALITIES),
      countries: Object.keys(COUNTRIES),
    });
  } catch (error) {
    console.error("Error in public clusters API:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
