"use client";

import { useMemo } from "react";
import { SearchableSelect } from "@/components/ui/searchable-select";

const TIMEZONES = [
  { value: "America/New_York", label: "Estados Unidos - Este (New York)" },
  { value: "America/Chicago", label: "Estados Unidos - Centro (Chicago)" },
  { value: "America/Denver", label: "Estados Unidos - Montana (Denver)" },
  { value: "America/Los_Angeles", label: "Estados Unidos - Pacífico (Los Angeles)" },
  { value: "America/Mexico_City", label: "México - Ciudad de México" },
  { value: "America/Bogota", label: "Colombia - Bogotá" },
  { value: "America/Lima", label: "Perú - Lima" },
  { value: "America/Santiago", label: "Chile - Santiago" },
  { value: "America/Argentina/Buenos_Aires", label: "Argentina - Buenos Aires" },
  { value: "America/Montevideo", label: "Uruguay - Montevideo" },
  { value: "America/Caracas", label: "Venezuela - Caracas" },
  { value: "America/Guayaquil", label: "Ecuador - Guayaquil" },
  { value: "America/Guatemala", label: "Guatemala - Guatemala" },
  { value: "America/Havana", label: "Cuba - La Habana" },
  { value: "America/La_Paz", label: "Bolivia - La Paz" },
  { value: "America/Santo_Domingo", label: "República Dominicana - Santo Domingo" },
  { value: "America/Tegucigalpa", label: "Honduras - Tegucigalpa" },
  { value: "America/Asuncion", label: "Paraguay - Asunción" },
  { value: "America/El_Salvador", label: "El Salvador - San Salvador" },
  { value: "America/Managua", label: "Nicaragua - Managua" },
  { value: "America/Costa_Rica", label: "Costa Rica - San José" },
  { value: "America/Panama", label: "Panamá - Panamá" },
  { value: "Europe/Madrid", label: "España - Madrid" },
  { value: "Europe/Paris", label: "Francia - París" },
  { value: "Europe/London", label: "Reino Unido - Londres" },
  { value: "Europe/Berlin", label: "Alemania - Berlín" },
  { value: "Europe/Rome", label: "Italia - Roma" },
  { value: "Europe/Lisbon", label: "Portugal - Lisboa" },
  { value: "Europe/Amsterdam", label: "Países Bajos - Ámsterdam" },
  { value: "Europe/Brussels", label: "Bélgica - Bruselas" },
  { value: "Europe/Zurich", label: "Suiza - Zúrich" },
  { value: "Europe/Vienna", label: "Austria - Viena" },
  { value: "Europe/Athens", label: "Grecia - Atenas" },
  { value: "Europe/Moscow", label: "Rusia - Moscú" },
  { value: "Europe/Istanbul", label: "Turquía - Estambul" },
  { value: "Africa/Cairo", label: "Egipto - El Cairo" },
  { value: "Africa/Johannesburg", label: "Sudáfrica - Johannesburgo" },
  { value: "Africa/Lagos", label: "Nigeria - Lagos" },
  { value: "Asia/Dubai", label: "Emiratos Árabes - Dubái" },
  { value: "Asia/Kolkata", label: "India - Kolkata" },
  { value: "Asia/Bangkok", label: "Tailandia - Bangkok" },
  { value: "Asia/Singapore", label: "Singapur - Singapur" },
  { value: "Asia/Hong_Kong", label: "Hong Kong" },
  { value: "Asia/Shanghai", label: "China - Shanghái" },
  { value: "Asia/Tokyo", label: "Japón - Tokio" },
  { value: "Asia/Seul", label: "Corea del Sur - Seúl" },
  { value: "Australia/Sydney", label: "Australia - Sídney" },
  { value: "Australia/Melbourne", label: "Australia - Melbourne" },
  { value: "Pacific/Auckland", label: "Nueva Zelanda - Auckland" },
];

interface TimezoneSelectorProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function TimezoneSelector({ value, onChange, disabled = false }: TimezoneSelectorProps) {
  const sortedTimezones = useMemo(() => {
    return [...TIMEZONES].sort((a, b) => {
      // Priorizar zonas horarias de América Latina
      const latamPrefixes = ["America/", "America/Mexico", "America/Bogota", "America/Lima", "America/Santiago", "America/Argentina"];
      const isALatam = (tz: string) => latamPrefixes.some(p => tz.startsWith(p));
      const aIsLatam = isALatam(a.value);
      const bIsLatam = isALatam(b.value);

      if (aIsLatam && !bIsLatam) return -1;
      if (!aIsLatam && bIsLatam) return 1;
      return a.label.localeCompare(b.label);
    });
  }, []);

  return (
    <div className="space-y-2">
      <SearchableSelect
        options={sortedTimezones}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder="Selecciona una zona horaria"
        name="timezone"
        searchPlaceholder="Buscar zona horaria..."
      />
      <p className="text-xs text-muted-foreground">
        La zona horaria afecta la programación de clases y eventos
      </p>
    </div>
  );
}

export { TIMEZONES };
