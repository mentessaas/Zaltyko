"use client";

import { useEffect, useState } from "react";

import {
  findLoadedCitiesByRegion,
  getLoadedCities,
  loadCities,
  type CityOption,
} from "@/lib/geo-loader";

/**
 * Cities of a region, loading the country's list on demand.
 *
 * Returns an empty list until that country's chunk arrives (immediately if it
 * is already cached), then re-renders with the cities. Selects that depend on
 * it simply show no options for that instant, as they did for unknown
 * regions before.
 */
export function useCitiesByRegion(
  countryCode: string | null | undefined,
  regionValue: string | null | undefined
): CityOption[] {
  const code = (countryCode ?? "").trim().toLowerCase();
  const [, setLoadedCode] = useState<string | null>(() => (getLoadedCities(code) ? code : null));

  useEffect(() => {
    if (!code || getLoadedCities(code)) return;
    let active = true;
    loadCities(code)
      .then(() => {
        if (active) setLoadedCode(code);
      })
      .catch(() => {
        // A failed chunk load leaves the select empty; a later render retries.
      });
    return () => {
      active = false;
    };
  }, [code]);

  return findLoadedCitiesByRegion(code, regionValue);
}
