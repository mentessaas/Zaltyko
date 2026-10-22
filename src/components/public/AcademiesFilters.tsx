"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { getRegionLabel, getCityPlaceholder, COUNTRY_REGION_OPTIONS, findRegionsByCountry } from "@/lib/countryRegions";
import { findCitiesByRegion } from "@/lib/citiesByRegion";
import { pluralizeFirstWord } from "@/lib/specialization/registry";

const ACADEMY_TYPES = [
  { value: "artistica", label: "Gimnasia Artística" },
  { value: "ritmica", label: "Gimnasia Rítmica" },
  { value: "general", label: "Mixta artística/rítmica" },
] as const;

interface AcademiesFiltersProps {
  onFiltersChange?: (filters: {
    search?: string;
    type?: string;
    country?: string;
    region?: string;
    city?: string;
  }) => void;
}

export function AcademiesFilters({ onFiltersChange }: AcademiesFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [type, setType] = useState(searchParams.get("type") || "");
  const [country, setCountry] = useState(searchParams.get("country") || "");
  const [region, setRegion] = useState(searchParams.get("region") || "");
  const [city, setCity] = useState(searchParams.get("city") || "");
  
  // Track previous country and region to detect changes
  const [prevCountry, setPrevCountry] = useState(country);
  const [prevRegion, setPrevRegion] = useState(region);

  const [regions, setRegions] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const regionLabelPlural = pluralizeFirstWord(getRegionLabel(country)).toLowerCase();
  
  // Usar useRef para mantener una referencia estable a onFiltersChange
  const onFiltersChangeRef = useRef(onFiltersChange);
  useEffect(() => {
    onFiltersChangeRef.current = onFiltersChange;
  }, [onFiltersChange]);

  // Filtrar regiones según el país seleccionado
  useEffect(() => {
    if (country) {
      // Normalizar país a minúsculas para buscar en COUNTRY_REGION_OPTIONS
      const normalizedCountry = country.toLowerCase();
      const regionsList = findRegionsByCountry(normalizedCountry);
      
      // Mapear a labels para mostrar
      const regionLabels = regionsList.map(r => r.label);
      setRegions(regionLabels);
      
      // Limpiar región y ciudad cuando cambia el país
      if (prevCountry !== country && country) {
        setRegion("");
        setCity("");
        setPrevCountry(country);
      }
    } else {
      setRegions([]);
      // Si se deselecciona el país, limpiar región y ciudad
      if (prevCountry && !country) {
        setRegion("");
        setCity("");
        setPrevCountry("");
      }
    }
  }, [country, prevCountry]);

  // Filtrar ciudades según la región seleccionada (y país si está seleccionado)
  useEffect(() => {
    if (!region) {
      setCities([]);
      // Si se deselecciona la región, limpiar ciudad
      if (prevRegion && !region) {
        setCity("");
        setPrevRegion("");
      }
      return;
    }

    // Si hay región seleccionada, buscar el país correspondiente
    const normalizedCountry = country ? country.toLowerCase() : null;
    
    if (!normalizedCountry) {
      // Si no hay país pero hay región, buscar en todos los países
      for (const countryOption of COUNTRY_REGION_OPTIONS) {
        const regionOption = countryOption.regions.find(r => r.label === region);
        if (regionOption) {
          const citiesList = findCitiesByRegion(countryOption.value, regionOption.value);
          const cityLabels = citiesList.map(c => c.label);
          setCities(cityLabels.sort());
          break;
        }
      }
    } else {
      // Buscar la región en el país seleccionado
      const regionsList = findRegionsByCountry(normalizedCountry);
      const regionOption = regionsList.find(r => r.label === region);
      
      if (regionOption) {
        const citiesList = findCitiesByRegion(normalizedCountry, regionOption.value);
        const cityLabels = citiesList.map(c => c.label);
        setCities(cityLabels.sort());
      } else {
        setCities([]);
      }
    }
    
    // Limpiar ciudad cuando cambia la región
    if (prevRegion !== region && region) {
      setCity("");
      setPrevRegion(region);
    }
  }, [region, country, prevRegion]);

  // Aplicar filtros
  const applyFilters = useCallback(() => {
    const params = new URLSearchParams();
    
    if (search) params.set("search", search);
    if (type) params.set("type", type);
    if (country) params.set("country", country);
    if (region) params.set("region", region);
    if (city) params.set("city", city);

    router.push(`/academias?${params.toString()}`);
    
    if (onFiltersChangeRef.current) {
      onFiltersChangeRef.current({
        search: search || undefined,
        type: type || undefined,
        country: country || undefined,
        region: region || undefined,
        city: city || undefined,
      });
    }
  }, [search, type, country, region, city, router]);

  // Debounce para búsqueda
  useEffect(() => {
    const timer = setTimeout(() => {
      applyFilters();
    }, 500);

    return () => clearTimeout(timer);
  }, [search, applyFilters]);

  // Aplicar filtros inmediatamente cuando cambian otros campos
  useEffect(() => {
    applyFilters();
  }, [type, country, region, city, applyFilters]);

  const clearFilters = () => {
    setSearch("");
    setType("");
    setCountry("");
    setRegion("");
    setCity("");
    router.push("/academias");
  };

  const hasActiveFilters = search || type || country || region || city;

  return (
    <div className="border-b border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {/* Búsqueda */}
          <div className="relative sm:col-span-2 lg:col-span-2">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              aria-label="Buscar academias por nombre"
              placeholder="Buscar por nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-all focus:border-zaltyko-primary focus:bg-background focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
            />
          </div>

          {/* Tipo */}
          <select
            value={type}
            aria-label="Filtrar por modalidad"
            onChange={(e) => setType(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
          >
            <option value="">Todos los tipos</option>
            {ACADEMY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          {/* País */}
          <select
            value={country}
            aria-label="Filtrar por país"
            onChange={(e) => setCountry(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground disabled:opacity-50 disabled:cursor-not-allowed focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
          >
            <option value="">Todos los países</option>
            {COUNTRY_REGION_OPTIONS.map((c) => (
              <option key={c.value} value={c.value.toUpperCase()}>
                {c.label}
              </option>
            ))}
          </select>

          {/* Provincia/Estado */}
          <select
            value={region}
            aria-label={`Filtrar por ${getRegionLabel(country).toLowerCase()}`}
            onChange={(e) => setRegion(e.target.value)}
            disabled={!country || regions.length === 0}
            className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground disabled:opacity-50 disabled:cursor-not-allowed focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
            title={getRegionLabel(country)}
          >
            <option value="">
              {!country ? "Selecciona un país primero" : regions.length === 0 ? `No hay ${regionLabelPlural} disponibles` : `Todas las ${regionLabelPlural}`}
            </option>
            {regions.length > 0 ? (
              regions.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))
            ) : null}
          </select>

          {/* Ciudad */}
          <select
            value={city}
            aria-label="Filtrar por ciudad"
            onChange={(e) => setCity(e.target.value)}
            disabled={!region || cities.length === 0}
            className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground disabled:opacity-50 disabled:cursor-not-allowed focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
          >
            <option value="">
              {!region ? getCityPlaceholder(getRegionLabel(country), false) : cities.length === 0 ? "No hay ciudades disponibles" : "Todas las ciudades"}
            </option>
            {cities.length > 0 ? (
              cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))
            ) : null}
          </select>
        </div>

        {/* Botón limpiar filtros */}
        {hasActiveFilters && (
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <div className="flex flex-wrap items-center gap-2">
              {search && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zaltyko-primary/30 bg-zaltyko-primary/10 px-3 py-1 text-xs font-medium text-zaltyko-primary">
                  Búsqueda: {search}
                  <button
                    type="button"
                    aria-label="Quitar filtro de búsqueda"
                    onClick={() => setSearch("")}
                    className="hover:text-zaltyko-primary-dark"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {type && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
                  {ACADEMY_TYPES.find(t => t.value === type)?.label || type}
                  <button
                    type="button"
                    aria-label="Quitar filtro de modalidad"
                    onClick={() => setType("")}
                    className="hover:text-muted-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {country && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
                  {country}
                  <button
                    type="button"
                    aria-label="Quitar filtro de país"
                    onClick={() => setCountry("")}
                    className="hover:text-muted-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {region && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
                  {region}
                  <button
                    type="button"
                    aria-label={`Quitar filtro de ${getRegionLabel(country).toLowerCase()}`}
                    onClick={() => setRegion("")}
                    className="hover:text-muted-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {city && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
                  {city}
                  <button
                    type="button"
                    aria-label="Quitar filtro de ciudad"
                    onClick={() => setCity("")}
                    className="hover:text-muted-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
            <button
              type="button"
              aria-label="Limpiar todos los filtros"
              onClick={clearFilters}
              className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-all hover:bg-muted hover:border-zaltyko-primary/50"
            >
              <X className="h-4 w-4" />
              Limpiar todo
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
