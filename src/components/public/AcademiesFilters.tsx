"use client";

import { useState, useEffect, useCallback } from "react";
import { Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

const ACADEMY_TYPES = [
  { value: "artistica", label: "Gimnasia Artística" },
  { value: "ritmica", label: "Gimnasia Rítmica" },
  { value: "trampolin", label: "Trampolín" },
  { value: "general", label: "Gimnasia General" },
  { value: "parkour", label: "Parkour" },
  { value: "danza", label: "Danza" },
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

  const [countries, setCountries] = useState<string[]>([]);
  const [allAcademies, setAllAcademies] = useState<any[]>([]);
  const [regions, setRegions] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Cargar opciones de países y academias
  useEffect(() => {
    async function loadFilterOptions() {
      try {
        setLoading(true);
        
        // Cargar opciones de filtros desde el endpoint dedicado (solo para países)
        const filterOptionsResponse = await fetch("/api/public/academies/filter-options");
        
        if (!filterOptionsResponse.ok) {
          throw new Error(`HTTP error! status: ${filterOptionsResponse.status}`);
        }
        
        const filterOptions = await filterOptionsResponse.json();
        
        const countriesList = Array.isArray(filterOptions.countries) ? filterOptions.countries : [];
        
        setCountries(countriesList);
        
        // Cargar todas las academias para el filtrado dinámico
        const academiesResponse = await fetch("/api/public/academies?limit=1000");
        
        if (academiesResponse.ok) {
          const academiesData = await academiesResponse.json();
          const academiesList = academiesData.items || [];
          setAllAcademies(academiesList);
          
          // Inicializar regiones y ciudades si no hay filtros seleccionados desde la URL
          const urlCountry = searchParams.get("country");
          const urlRegion = searchParams.get("region");
          
          if (!urlCountry && !urlRegion) {
            // Mostrar todas las regiones
            const allRegions = new Set<string>();
            academiesList.forEach((academy: any) => {
              if (academy.region) {
                const normalizedRegion = (academy.region || "").toString().trim();
                if (normalizedRegion) {
                  allRegions.add(normalizedRegion);
                }
              }
            });
            setRegions(Array.from(allRegions).sort());
            
            // Mostrar todas las ciudades
            const allCities = new Set<string>();
            academiesList.forEach((academy: any) => {
              if (academy.city) {
                const normalizedCity = (academy.city || "").toString().trim();
                if (normalizedCity) {
                  allCities.add(normalizedCity);
                }
              }
            });
            setCities(Array.from(allCities).sort());
          }
        }
      } catch (error) {
        console.error("Error loading filter options:", error);
        // En caso de error, dejar arrays vacíos
        setCountries([]);
        setRegions([]);
        setCities([]);
        setAllAcademies([]);
      } finally {
        setLoading(false);
      }
    }

    loadFilterOptions();
  }, []);

  // Filtrar regiones según el país seleccionado
  useEffect(() => {
    if (allAcademies.length === 0) {
      setRegions([]);
      return; // No hacer nada si aún no hay academias cargadas
    }

    if (country) {
      // Normalizar país para comparación (mayúsculas)
      const normalizedCountry = country.toUpperCase();
      const countryRegions = new Set<string>();
      
      allAcademies
        .filter((academy: any) => {
          const academyCountry = (academy.country || "").toString().toUpperCase().trim();
          return academyCountry === normalizedCountry;
        })
        .forEach((academy: any) => {
          if (academy.region) {
            const normalizedRegion = (academy.region || "").toString().trim();
            if (normalizedRegion) {
              countryRegions.add(normalizedRegion);
            }
          }
        });
      
      setRegions(Array.from(countryRegions).sort());
      
      // Limpiar región y ciudad cuando cambia el país
      if (prevCountry !== country && country) {
        setRegion("");
        setCity("");
        setPrevCountry(country);
      }
    } else {
      // Si no hay país seleccionado, mostrar todas las regiones
      const allRegions = new Set<string>();
      allAcademies.forEach((academy: any) => {
        if (academy.region) {
          const normalizedRegion = (academy.region || "").toString().trim();
          if (normalizedRegion) {
            allRegions.add(normalizedRegion);
          }
        }
      });
      setRegions(Array.from(allRegions).sort());
      // Si se deselecciona el país, limpiar región y ciudad
      if (prevCountry && !country) {
        setRegion("");
        setCity("");
        setPrevCountry("");
      }
    }
  }, [country, allAcademies, prevCountry]);

  // Filtrar ciudades según la región seleccionada (y país si está seleccionado)
  useEffect(() => {
    if (allAcademies.length === 0) {
      setCities([]);
      return;
    }

    // Filtrar por país primero si está seleccionado
    let filteredAcademies = allAcademies;
    if (country) {
      const normalizedCountry = country.toUpperCase();
      filteredAcademies = allAcademies.filter((academy: any) => {
        const academyCountry = (academy.country || "").toString().toUpperCase().trim();
        return academyCountry === normalizedCountry;
      });
    }

    if (region) {
      // Filtrar por región
      const regionCities = new Set<string>();
      filteredAcademies
        .filter((academy: any) => {
          const academyRegion = (academy.region || "").toString().trim();
          return academyRegion === region.trim();
        })
        .forEach((academy: any) => {
          if (academy.city) {
            const normalizedCity = (academy.city || "").toString().trim();
            if (normalizedCity) {
              regionCities.add(normalizedCity);
            }
          }
        });
      setCities(Array.from(regionCities).sort());
      
      // Limpiar ciudad cuando cambia la región
      if (prevRegion !== region && region) {
        setCity("");
        setPrevRegion(region);
      }
    } else {
      // Si no hay región seleccionada, mostrar todas las ciudades del país (si hay país) o todas
      const allCities = new Set<string>();
      filteredAcademies.forEach((academy: any) => {
        if (academy.city) {
          const normalizedCity = (academy.city || "").toString().trim();
          if (normalizedCity) {
            allCities.add(normalizedCity);
          }
        }
      });
      setCities(Array.from(allCities).sort());
      // Si se deselecciona la región, limpiar ciudad
      if (prevRegion && !region) {
        setCity("");
        setPrevRegion("");
      }
    }
  }, [region, country, allAcademies, prevRegion]);

  // Aplicar filtros
  const applyFilters = useCallback(() => {
    const params = new URLSearchParams();
    
    if (search) params.set("search", search);
    if (type) params.set("type", type);
    if (country) params.set("country", country);
    if (region) params.set("region", region);
    if (city) params.set("city", city);

    router.push(`/academias?${params.toString()}`);
    
    if (onFiltersChange) {
      onFiltersChange({
        search: search || undefined,
        type: type || undefined,
        country: country || undefined,
        region: region || undefined,
        city: city || undefined,
      });
    }
  }, [search, type, country, region, city, router, onFiltersChange]);

  // Debounce para búsqueda
  useEffect(() => {
    const timer = setTimeout(() => {
      applyFilters();
    }, 500);

    return () => clearTimeout(timer);
  }, [search]);

  // Aplicar filtros inmediatamente cuando cambian otros campos
  useEffect(() => {
    applyFilters();
  }, [type, country, region, city]);

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
    <div className="sticky top-0 z-40 border-b border-white/10 bg-zaltyko-primary-dark/95 backdrop-blur">
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
          {/* Búsqueda */}
          <div className="relative sm:col-span-2 lg:col-span-2">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              placeholder="Buscar por nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-10 py-2.5 text-sm text-white placeholder:text-white/40 focus:border-zaltyko-accent/50 focus:outline-none focus:ring-2 focus:ring-zaltyko-accent/20"
            />
          </div>

          {/* Tipo */}
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white focus:border-zaltyko-accent/50 focus:outline-none focus:ring-2 focus:ring-zaltyko-accent/20"
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
            onChange={(e) => setCountry(e.target.value)}
            disabled={loading}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed focus:border-zaltyko-accent/50 focus:outline-none focus:ring-2 focus:ring-zaltyko-accent/20"
          >
            <option value="">Todos los países</option>
            {countries.length > 0 ? (
              countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))
            ) : (
              !loading && <option disabled>No hay países disponibles</option>
            )}
          </select>

          {/* Región */}
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            disabled={loading || !country || regions.length === 0}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed focus:border-zaltyko-accent/50 focus:outline-none focus:ring-2 focus:ring-zaltyko-accent/20"
          >
            <option value="">
              {!country ? "Selecciona un país primero" : regions.length === 0 ? "No hay regiones disponibles" : "Todas las regiones"}
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
            onChange={(e) => setCity(e.target.value)}
            disabled={loading || !region || cities.length === 0}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-2.5 text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed focus:border-zaltyko-accent/50 focus:outline-none focus:ring-2 focus:ring-zaltyko-accent/20"
          >
            <option value="">
              {!region ? "Selecciona una región primero" : cities.length === 0 ? "No hay ciudades disponibles" : "Todas las ciudades"}
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
          <div className="mt-3 flex justify-end">
            <button
              onClick={clearFilters}
              className="flex items-center gap-2 rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-sm font-medium text-white/80 transition hover:bg-white/10"
            >
              <X className="h-4 w-4" />
              Limpiar filtros
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

