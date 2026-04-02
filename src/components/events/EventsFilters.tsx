"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, Filter, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

interface EventsFiltersProps {
  disciplines?: Array<{ value: string; label: string }>;
  levels?: Array<{ value: string; label: string }>;
  eventTypes?: Array<{ value: string; label: string }>;
  countries?: Array<{ value: string; label: string }>;
  showDiscipline?: boolean;
  showLevel?: boolean;
  showEventType?: boolean;
  showCountry?: boolean;
  showDate?: boolean;
}

const DEFAULT_DISCIPLINES = [
  { value: "artistic_female", label: "Artística Femenina" },
  { value: "artistic_male", label: "Artística Masculina" },
  { value: "rhythmic", label: "Rítmica" },
  { value: "trampoline", label: "Trampolín" },
  { value: "parkour", label: "Parkour" },
];

const DEFAULT_LEVELS = [
  { value: "internal", label: "Interno" },
  { value: "local", label: "Local" },
  { value: "national", label: "Nacional" },
  { value: "international", label: "Internacional" },
];

const DEFAULT_EVENT_TYPES = [
  { value: "competitions", label: "Competiciones" },
  { value: "courses", label: "Cursos" },
  { value: "camps", label: "Campus" },
  { value: "workshops", label: "Talleres" },
  { value: "clinics", label: "Clínicas" },
  { value: "evaluations", label: "Evaluaciones" },
  { value: "other", label: "Otros" },
];

export function EventsFilters({
  disciplines = DEFAULT_DISCIPLINES,
  levels = DEFAULT_LEVELS,
  eventTypes = DEFAULT_EVENT_TYPES,
  countries,
  showDiscipline = true,
  showLevel = true,
  showEventType = true,
  showCountry = false,
  showDate = true,
}: EventsFiltersProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [showFilters, setShowFilters] = useState(false);

  const currentDiscipline = searchParams.get("discipline") || "";
  const currentLevel = searchParams.get("level") || "";
  const currentEventType = searchParams.get("eventType") || "";
  const currentCountry = searchParams.get("country") || "";
  const currentStartDate = searchParams.get("startDate") || "";

  const activeFiltersCount = [
    currentDiscipline,
    currentLevel,
    currentEventType,
    currentCountry,
    currentStartDate,
  ].filter(Boolean).length;

  const applyFilters = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page"); // Reset pagination
    router.push(`?${params.toString()}`);
  };

  const clearAllFilters = () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    router.push(`?${params.toString()}`);
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (search) {
      params.set("search", search);
    } else {
      params.delete("search");
    }
    params.delete("page");
    router.push(`?${params.toString()}`);
  };

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar eventos..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => setShowFilters(!showFilters)}
          className="relative"
        >
          <Filter className="h-4 w-4 mr-2" />
          Filtros
          {activeFiltersCount > 0 && (
            <Badge
              variant="default"
              className="ml-2 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center"
            >
              {activeFiltersCount}
            </Badge>
          )}
        </Button>
      </form>

      {/* Expanded Filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-4 rounded-lg border bg-card p-4">
          {showDiscipline && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Disciplina
              </label>
              <Select
                value={currentDiscipline}
                onValueChange={(value) => applyFilters("discipline", value)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todas</SelectItem>
                  {disciplines.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showLevel && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Nivel
              </label>
              <Select
                value={currentLevel}
                onValueChange={(value) => applyFilters("level", value)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos</SelectItem>
                  {levels.map((l) => (
                    <SelectItem key={l.value} value={l.value}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showEventType && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Tipo
              </label>
              <Select
                value={currentEventType}
                onValueChange={(value) => applyFilters("eventType", value)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos</SelectItem>
                  {eventTypes.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showCountry && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                País
              </label>
              <Select
                value={currentCountry}
                onValueChange={(value) => applyFilters("country", value)}
              >
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Todos</SelectItem>
                  {countries?.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {showDate && (
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Fecha desde
              </label>
              <Input
                type="date"
                value={currentStartDate}
                onChange={(e) => applyFilters("startDate", e.target.value)}
                className="w-[180px]"
              />
            </div>
          )}

          {activeFiltersCount > 0 && (
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
                className="text-muted-foreground"
              >
                <X className="h-4 w-4 mr-1" />
                Limpiar
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
