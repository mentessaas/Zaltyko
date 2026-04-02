export type CityOption = {
  value: string;
  label: string;
};

export type RegionCities = {
  [regionValue: string]: CityOption[];
};

// Cache for loaded city data
const cityDataCache: Record<string, RegionCities | null> = {
  es: null,
  mx: null,
};

// Lazy loading of city data via dynamic imports
async function loadCityData(countryCode: string): Promise<RegionCities | null> {
  const code = countryCode.toLowerCase();

  if (cityDataCache[code] !== null) {
    return cityDataCache[code]!;
  }

  try {
    let data: RegionCities;

    switch (code) {
      case 'es':
        data = await import('@/data/geo/cities-es.json').then(m => m.default);
        break;
      case 'mx':
        data = await import('@/data/geo/cities-mx.json').then(m => m.default);
        break;
      default:
        cityDataCache[code] = null;
        return null;
    }

    cityDataCache[code] = data;
    return data;
  } catch (error) {
    console.error(`Failed to load city data for ${code}:`, error);
    cityDataCache[code] = null;
    return null;
  }
}

// Synchronous cache access for already-loaded data
const cityDataSyncCache: Record<string, RegionCities | null> = {
  es: null,
  mx: null,
};

function getCachedCityData(countryCode: string): RegionCities | null {
  const code = countryCode.toLowerCase();
  return cityDataSyncCache[code] ?? null;
}

function setCachedCityData(countryCode: string, data: RegionCities): void {
  const code = countryCode.toLowerCase();
  cityDataSyncCache[code] = data;
  cityDataCache[code] = data;
}

/**
 * Get all cities for a given country (synchronous, returns cached data)
 */
export function getCities(countryCode: string): RegionCities {
  const cached = getCachedCityData(countryCode);
  if (cached) return cached;

  // For SSR or sync access, return empty if not yet loaded
  // Use getCitiesAsync for non-blocking access
  return {};
}

/**
 * Get all cities for a given country (async, triggers lazy load)
 */
export async function getCitiesAsync(countryCode: string): Promise<RegionCities> {
  const cached = getCachedCityData(countryCode);
  if (cached) return cached;

  const data = await loadCityData(countryCode);
  if (data) {
    setCachedCityData(countryCode, data);
  }
  return data ?? {};
}

/**
 * Get cities for a specific region in a country (synchronous)
 */
export function findCitiesByRegion(
  countryCode: string,
  regionValue: string
): CityOption[] {
  const cities = getCities(countryCode);
  return cities[regionValue] ?? [];
}

/**
 * Get cities for a specific region in a country (async)
 */
export async function findCitiesByRegionAsync(
  countryCode: string,
  regionValue: string
): Promise<CityOption[]> {
  const cities = await getCitiesAsync(countryCode);
  return cities[regionValue] ?? [];
}

/**
 * Search cities by query across all regions for a country
 */
export async function searchCities(
  countryCode: string,
  query: string
): Promise<CityOption[]> {
  if (!query || query.length < 2) return [];

  const cities = await getCitiesAsync(countryCode);
  const lowerQuery = query.toLowerCase();

  const results: CityOption[] = [];

  for (const regionCities of Object.values(cities)) {
    for (const city of regionCities) {
      if (
        city.label.toLowerCase().includes(lowerQuery) ||
        city.value.toLowerCase().includes(lowerQuery)
      ) {
        results.push(city);
      }
    }
  }

  return results;
}

/**
 * Preload city data for a country (useful for prefetching)
 */
export function preloadCities(countryCode: string): void {
  const code = countryCode.toLowerCase();

  // Trigger async load without awaiting
  loadCityData(code).then(data => {
    if (data) {
      setCachedCityData(code, data);
    }
  });
}
