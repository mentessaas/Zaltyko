"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { getRegionLabel, getRegionPlaceholder, getCityPlaceholder, COUNTRY_REGION_OPTIONS, findRegionsByCountry } from "@/lib/countryRegions";
import { findCitiesByRegion } from "@/lib/citiesByRegion";

const EVENT_LEVELS = [
  { value: "internal", label: "Interno" },
  { value: "local", label: "Local" },
  { value: "national", label: "Nacional" },
  { value: "international", label: "Internacional" },
] as const;

const EVENT_DISCIPLINES = [
  { value: "artistic_female", label: "Gimnasia Artística Femenina" },
  { value: "artistic_male", label: "Gimnasia Artística Masculina" },
  { value: "rhythmic", label: "Gimnasia Rítmica" },
  { value: "trampoline", label: "Trampolín" },
  { value: "parkour", label: "Parkour" },
] as const;

const EVENT_TYPES = [
  { value: "competitions", label: "Competición" },
  { value: "courses", label: "Curso" },
  { value: "camps", label: "Campamento" },
  { value: "workshops", label: "Taller" },
  { value: "clinics", label: "Clínica" },
  { value: "evaluations", label: "Evaluación" },
  { value: "other", label: "Otro" },
] as const;

interface EventsFiltersProps {
  onFiltersChange?: (filters: {
    search?: string;
    discipline?: string;
    level?: string;
    eventType?: string;
    country?: string;
    province?: string;
    city?: string;
    startDate?: string;
    endDate?: string;
  }) => void;
}

export function EventsFilters({ onFiltersChange }: EventsFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [discipline, setDiscipline] = useState(searchParams.get("discipline") || "");
  const [level, setLevel] = useState(searchParams.get("level") || "");
  const [eventType, setEventType] = useState(searchParams.get("eventType") || "");
  const [country, setCountry] = useState(searchParams.get("country") || "");
  const [province, setProvince] = useState(searchParams.get("province") || "");
  const [city, setCity] = useState(searchParams.get("city") || "");
  const [startDate, setStartDate] = useState(searchParams.get("startDate") || "");
  const [endDate, setEndDate] = useState(searchParams.get("endDate") || "");
  
  const [prevCountry, setPrevCountry] = useState(country);
  const [prevProvince, setPrevProvince] = useState(province);

  const [regions, setRegions] = useState<string[]>([]);
  const [cities, setCities] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  
  const onFiltersChangeRef = useRef(onFiltersChange);
  useEffect(() => {
    onFiltersChangeRef.current = onFiltersChange;
  }, [onFiltersChange]);

  // Cargar opciones de ubicación
  useEffect(() => {
    async function loadFilterOptions() {
      try {
        setLoading(true);
        const countriesList = COUNTRY_REGION_OPTIONS.map(c => c.value.toUpperCase());
        
        if (country) {
          const normalizedCountry = country.toLowerCase();
          const regionsList = findRegionsByCountry(normalizedCountry);
          setRegions(regionsList.map(r => r.label));
        } else {
          const allRegions = new Set<string>();
          COUNTRY_REGION_OPTIONS.forEach(country => {
            country.regions.forEach(region => {
              allRegions.add(region.label);
            });
          });
          setRegions(Array.from(allRegions).sort());
        }
      } catch (error) {
        console.error("Error loading filter options:", error);
      } finally {
        setLoading(false);
      }
    }

    loadFilterOptions();
  }, [country]);

  // Filtrar ciudades según región
  useEffect(() => {
    if (province && country) {
      const normalizedCountry = country.toLowerCase();
      const regionsList = findRegionsByCountry(normalizedCountry);
      const regionOption = regionsList.find(r => r.label === province);
      
      if (regionOption) {
        const citiesList = findCitiesByRegion(normalizedCountry, regionOption.value);
        setCities(citiesList.map(c => c.label));
      }
    } else if (province) {
      for (const countryOption of COUNTRY_REGION_OPTIONS) {
        const regionOption = countryOption.regions.find(r => r.label === province);
        if (regionOption) {
          const citiesList = findCitiesByRegion(countryOption.value, regionOption.value);
          setCities(citiesList.map(c => c.label));
          break;
        }
      }
    } else {
      setCities([]);
    }
  }, [province, country]);

  const applyFilters = useCallback(() => {
    const params = new URLSearchParams();
    
    if (search) params.set("search", search);
    if (discipline) params.set("discipline", discipline);
    if (level) params.set("level", level);
    if (eventType) params.set("eventType", eventType);
    if (country) params.set("country", country);
    if (province) params.set("province", province);
    if (city) params.set("city", city);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);
    
    router.push(`/events?${params.toString()}`);
    
    if (onFiltersChangeRef.current) {
      onFiltersChangeRef.current({
        search: search || undefined,
        discipline: discipline || undefined,
        level: level || undefined,
        eventType: eventType || undefined,
        country: country || undefined,
        province: province || undefined,
        city: city || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
    }
  }, [search, discipline, level, eventType, country, province, city, startDate, endDate, router]);

  useEffect(() => {
    const timer = setTimeout(() => {
      applyFilters();
    }, 500);

    return () => clearTimeout(timer);
  }, [search, applyFilters]);

  useEffect(() => {
    applyFilters();
  }, [discipline, level, eventType, country, province, city, startDate, endDate, applyFilters]);

  const clearFilters = () => {
    setSearch("");
    setDiscipline("");
    setLevel("");
    setEventType("");
    setCountry("");
    setProvince("");
    setCity("");
    setStartDate("");
    setEndDate("");
    router.push("/events");
  };

  const hasActiveFilters = search || discipline || level || eventType || country || province || city || startDate || endDate;

  return (
    <div className="border-b border-border bg-background">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {/* Búsqueda */}
          <div className="relative sm:col-span-2 lg:col-span-2 xl:col-span-2">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por título..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-card px-10 py-2.5 text-sm text-foreground placeholder:text-muted-foreground transition-all focus:border-zaltyko-primary focus:bg-background focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
            />
          </div>

          {/* Disciplina */}
          <select
            value={discipline}
            onChange={(e) => setDiscipline(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
          >
            <option value="">Todas las disciplinas</option>
            {EVENT_DISCIPLINES.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>

          {/* Nivel */}
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
          >
            <option value="">Todos los niveles</option>
            {EVENT_LEVELS.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>

          {/* Tipo de evento */}
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
          >
            <option value="">Todos los tipos</option>
            {EVENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          {/* País */}
          <select
            value={country}
            onChange={(e) => {
              setCountry(e.target.value);
              if (prevCountry !== e.target.value) {
                setProvince("");
                setCity("");
                setPrevCountry(e.target.value);
              }
            }}
            disabled={loading}
            className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground disabled:opacity-50 disabled:cursor-not-allowed focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
          >
            <option value="">Todos los países</option>
            {COUNTRY_REGION_OPTIONS.map((c) => (
              <option key={c.value} value={c.value.toUpperCase()}>
                {c.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
          {/* Provincia */}
          <select
            value={province}
            onChange={(e) => {
              setProvince(e.target.value);
              if (prevProvince !== e.target.value) {
                setCity("");
                setPrevProvince(e.target.value);
              }
            }}
            disabled={loading || !country || regions.length === 0}
            className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground disabled:opacity-50 disabled:cursor-not-allowed focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
          >
            <option value="">
              {!country ? "Selecciona un país primero" : regions.length === 0 ? `No hay ${getRegionLabel(country).toLowerCase()}s disponibles` : `Todas las ${getRegionLabel(country).toLowerCase()}s`}
            </option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>

          {/* Ciudad */}
          <select
            value={city}
            onChange={(e) => setCity(e.target.value)}
            disabled={loading || !province || cities.length === 0}
            className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground disabled:opacity-50 disabled:cursor-not-allowed focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
          >
            <option value="">
              {!province ? getCityPlaceholder(getRegionLabel(country), false) : cities.length === 0 ? "No hay ciudades disponibles" : "Todas las ciudades"}
            </option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          {/* Fecha inicio */}
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
            placeholder="Fecha inicio"
          />

          {/* Fecha fin */}
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            min={startDate || undefined}
            className="rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
            placeholder="Fecha fin"
          />
        </div>

        {/* Botón limpiar filtros */}
        {hasActiveFilters && (
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <div className="flex flex-wrap items-center gap-2">
              {search && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-zaltyko-primary/30 bg-zaltyko-primary/10 px-3 py-1 text-xs font-medium text-zaltyko-primary">
                  Búsqueda: {search}
                  <button onClick={() => setSearch("")} className="hover:text-zaltyko-primary-dark">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {discipline && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
                  {EVENT_DISCIPLINES.find(d => d.value === discipline)?.label || discipline}
                  <button onClick={() => setDiscipline("")} className="hover:text-muted-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {level && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
                  {EVENT_LEVELS.find(l => l.value === level)?.label || level}
                  <button onClick={() => setLevel("")} className="hover:text-muted-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {eventType && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
                  {EVENT_TYPES.find(t => t.value === eventType)?.label || eventType}
                  <button onClick={() => setEventType("")} className="hover:text-muted-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {country && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
                  {country}
                  <button onClick={() => setCountry("")} className="hover:text-muted-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {province && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
                  {province}
                  <button onClick={() => setProvince("")} className="hover:text-muted-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {city && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
                  {city}
                  <button onClick={() => setCity("")} className="hover:text-muted-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {startDate && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
                  Desde: {new Date(startDate).toLocaleDateString("es-ES")}
                  <button onClick={() => setStartDate("")} className="hover:text-muted-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {endDate && (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1 text-xs font-medium text-foreground">
                  Hasta: {new Date(endDate).toLocaleDateString("es-ES")}
                  <button onClick={() => setEndDate("")} className="hover:text-muted-foreground">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
            <button
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

