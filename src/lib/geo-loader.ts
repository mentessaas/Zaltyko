/**
 * Cities by region, loaded per country on demand.
 *
 * Each country lives in its own JSON file under src/data/geo/cities and is
 * reached only through the dynamic imports below, so the bundler emits one
 * small chunk per country instead of shipping every list (≈80 KB of source
 * for 21 countries) inside each client and server bundle that offers a city
 * select. Never import those JSON files statically:
 * tests/geo-cities-on-demand.test.ts enforces it.
 */

export type CityOption = {
  value: string;
  label: string;
};

export type RegionCities = {
  [regionValue: string]: CityOption[];
};

type CountryLoader = () => Promise<{ default: RegionCities }>;

const COUNTRY_LOADERS: Readonly<Record<string, CountryLoader>> = {
  ar: () => import("@/data/geo/cities/ar.json"),
  bo: () => import("@/data/geo/cities/bo.json"),
  cl: () => import("@/data/geo/cities/cl.json"),
  co: () => import("@/data/geo/cities/co.json"),
  cr: () => import("@/data/geo/cities/cr.json"),
  cu: () => import("@/data/geo/cities/cu.json"),
  do: () => import("@/data/geo/cities/do.json"),
  ec: () => import("@/data/geo/cities/ec.json"),
  es: () => import("@/data/geo/cities/es.json"),
  gt: () => import("@/data/geo/cities/gt.json"),
  hn: () => import("@/data/geo/cities/hn.json"),
  mx: () => import("@/data/geo/cities/mx.json"),
  ni: () => import("@/data/geo/cities/ni.json"),
  pa: () => import("@/data/geo/cities/pa.json"),
  pe: () => import("@/data/geo/cities/pe.json"),
  pr: () => import("@/data/geo/cities/pr.json"),
  py: () => import("@/data/geo/cities/py.json"),
  sv: () => import("@/data/geo/cities/sv.json"),
  us: () => import("@/data/geo/cities/us.json"),
  uy: () => import("@/data/geo/cities/uy.json"),
  ve: () => import("@/data/geo/cities/ve.json"),
};

/** Country codes with a city list. */
export const CITY_COUNTRY_CODES: readonly string[] = Object.freeze(Object.keys(COUNTRY_LOADERS));

// Shared empty result: stable identity for React memoization. Never mutate it.
const EMPTY_CITIES: CityOption[] = [];
const loaded = new Map<string, RegionCities>();
const pending = new Map<string, Promise<RegionCities>>();

function normalize(countryCode: string | null | undefined): string {
  return (countryCode ?? "").trim().toLowerCase();
}

/** Already-loaded cities for a country, or null if not loaded (or unknown). */
export function getLoadedCities(countryCode: string | null | undefined): RegionCities | null {
  return loaded.get(normalize(countryCode)) ?? null;
}

/**
 * Loads the cities of one country once and caches them. Unknown countries
 * resolve to an empty map; a failed chunk load is not cached, so a later
 * call can retry.
 */
export function loadCities(countryCode: string | null | undefined): Promise<RegionCities> {
  const code = normalize(countryCode);
  const cached = loaded.get(code);
  if (cached) return Promise.resolve(cached);
  const loader = Object.prototype.hasOwnProperty.call(COUNTRY_LOADERS, code) ? COUNTRY_LOADERS[code] : undefined;
  if (!loader) return Promise.resolve({});

  const inFlight = pending.get(code);
  if (inFlight) return inFlight;

  const request = loader()
    .then(module => {
      loaded.set(code, module.default);
      return module.default;
    })
    .finally(() => pending.delete(code));
  pending.set(code, request);
  return request;
}

/** Cities of one region, loading the country's list if needed. */
export async function findCitiesByRegionAsync(
  countryCode: string | null | undefined,
  regionValue: string | null | undefined
): Promise<CityOption[]> {
  if (!regionValue) return EMPTY_CITIES;
  const cities = await loadCities(countryCode);
  return cities[regionValue] ?? EMPTY_CITIES;
}

/** Synchronous lookup over already-loaded data; empty until the country loads. */
export function findLoadedCitiesByRegion(
  countryCode: string | null | undefined,
  regionValue: string | null | undefined
): CityOption[] {
  if (!regionValue) return EMPTY_CITIES;
  return getLoadedCities(countryCode)?.[regionValue] ?? EMPTY_CITIES;
}
