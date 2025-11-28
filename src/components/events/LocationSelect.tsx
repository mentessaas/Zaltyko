"use client";

import { useState, useEffect } from "react";
import { COUNTRY_REGION_OPTIONS, findRegionsByCountry, getRegionLabel, getRegionPlaceholder, getCityPlaceholder } from "@/lib/countryRegions";
import { findCitiesByRegion } from "@/lib/citiesByRegion";

interface LocationSelectProps {
  countryCode?: string | null;
  countryName?: string | null;
  provinceName?: string | null;
  cityName?: string | null;
  onLocationChange: (location: {
    countryCode: string;
    countryName: string;
    provinceName: string;
    cityName: string;
  }) => void;
  className?: string;
}

export function LocationSelect({
  countryCode: initialCountryCode,
  countryName: initialCountryName,
  provinceName: initialProvinceName,
  cityName: initialCityName,
  onLocationChange,
  className = "",
}: LocationSelectProps) {
  const [countryCode, setCountryCode] = useState(initialCountryCode || "");
  const [provinceValue, setProvinceValue] = useState(initialProvinceName || "");
  const [cityValue, setCityValue] = useState(initialCityName || "");

  // Obtener regiones y ciudades según selección
  const regions = countryCode ? findRegionsByCountry(countryCode) : [];
  const cities = countryCode && provinceValue ? findCitiesByRegion(countryCode, provinceValue) : [];

  // Encontrar nombres completos
  const selectedCountry = COUNTRY_REGION_OPTIONS.find(c => c.value === countryCode);
  const selectedRegion = regions.find(r => r.value === provinceValue);
  const selectedCity = cities.find(c => c.value === cityValue);

  useEffect(() => {
    if (countryCode && selectedCountry && provinceValue && selectedRegion && cityValue && selectedCity) {
      onLocationChange({
        countryCode,
        countryName: selectedCountry.label,
        provinceName: selectedRegion.label,
        cityName: selectedCity.label,
      });
    }
  }, [countryCode, provinceValue, cityValue, selectedCountry, selectedRegion, selectedCity, onLocationChange]);

  const handleCountryChange = (newCountryCode: string) => {
    setCountryCode(newCountryCode);
    setProvinceValue(""); // Reset province
    setCityValue(""); // Reset city
  };

  const handleProvinceChange = (newProvinceValue: string) => {
    setProvinceValue(newProvinceValue);
    setCityValue(""); // Reset city
  };

  const regionLabel = getRegionLabel(countryCode);

  return (
    <div className={`grid gap-4 sm:grid-cols-3 ${className}`}>
      {/* País */}
      <div>
        <label htmlFor="country-select" className="mb-2 block text-sm font-medium text-foreground">
          País
        </label>
        <select
          id="country-select"
          value={countryCode}
          onChange={(e) => handleCountryChange(e.target.value)}
          className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
        >
          <option value="">Selecciona un país</option>
          {COUNTRY_REGION_OPTIONS.map((country) => (
            <option key={country.value} value={country.value}>
              {country.label}
            </option>
          ))}
        </select>
      </div>

      {/* Provincia/Estado */}
      <div>
        <label htmlFor="province-select" className="mb-2 block text-sm font-medium text-foreground">
          {regionLabel}
        </label>
        <select
          id="province-select"
          value={provinceValue}
          onChange={(e) => handleProvinceChange(e.target.value)}
          disabled={!countryCode || regions.length === 0}
          className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground disabled:opacity-50 disabled:cursor-not-allowed focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
        >
          <option value="">
            {!countryCode
              ? "Selecciona un país primero"
              : regions.length === 0
              ? "No hay regiones disponibles"
              : getRegionPlaceholder(countryCode, true)}
          </option>
          {regions.map((region) => (
            <option key={region.value} value={region.value}>
              {region.label}
            </option>
          ))}
        </select>
      </div>

      {/* Ciudad */}
      <div>
        <label htmlFor="city-select" className="mb-2 block text-sm font-medium text-foreground">
          Ciudad
        </label>
        <select
          id="city-select"
          value={cityValue}
          onChange={(e) => setCityValue(e.target.value)}
          disabled={!provinceValue || cities.length === 0}
          className="w-full rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground disabled:opacity-50 disabled:cursor-not-allowed focus:border-zaltyko-primary focus:outline-none focus:ring-2 focus:ring-zaltyko-primary/20"
        >
          <option value="">
            {!provinceValue
              ? getCityPlaceholder(regionLabel, false)
              : cities.length === 0
              ? "No hay ciudades disponibles"
              : "Selecciona una ciudad"}
          </option>
          {cities.map((city) => (
            <option key={city.value} value={city.value}>
              {city.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

