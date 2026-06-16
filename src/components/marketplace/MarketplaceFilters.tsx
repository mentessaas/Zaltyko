"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

const CATEGORIES = [
  { value: "equipment", label: "Equipamiento" },
  { value: "clothing", label: "Ropa" },
  { value: "supplements", label: "Suplementos" },
  { value: "books", label: "Libros" },
  { value: "particular_training", label: "Clases particulares" },
  { value: "personal_training", label: "Entrenamiento personal" },
  { value: "clinics", label: "Clínicas" },
  { value: "arbitration", label: "Arbitraje" },
  { value: "physiotherapy", label: "Fisioterapia" },
  { value: "photography", label: "Fotografía" },
  { value: "other", label: "Otro" },
];

const TYPES = [
  { value: "product", label: "Productos" },
  { value: "service", label: "Servicios" },
];

export function MarketplaceFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [selectedTypes, setSelectedTypes] = useState<string[]>(
    searchParams.get("type") ? [searchParams.get("type")!] : []
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    searchParams.getAll("category")
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    selectedTypes.forEach(t => params.append("type", t));
    selectedCategories.forEach(c => params.append("category", c));
    router.push(`/marketplace?${params.toString()}`);
  };

  const clearFilters = () => {
    setSearch("");
    setSelectedTypes([]);
    setSelectedCategories([]);
    router.push("/marketplace");
  };

  const hasFilters = search || selectedTypes.length > 0 || selectedCategories.length > 0;

  return (
    <div className="space-y-6">
      <form onSubmit={handleSearch} className="space-y-4">
        <div>
          <Label htmlFor="search">Buscar</Label>
          <Input
            id="search"
            placeholder="Productos o servicios..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label>Tipo</Label>
          {TYPES.map((type) => (
            <div key={type.value} className="flex items-center space-x-2">
              <Checkbox
                id={`type-${type.value}`}
                checked={selectedTypes.includes(type.value)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedTypes([...selectedTypes, type.value]);
                  } else {
                    setSelectedTypes(selectedTypes.filter(t => t !== type.value));
                  }
                }}
              />
              <Label htmlFor={`type-${type.value}`} className="text-sm font-normal">
                {type.label}
              </Label>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <Label>Categoría</Label>
          {CATEGORIES.map((cat) => (
            <div key={cat.value} className="flex items-center space-x-2">
              <Checkbox
                id={`cat-${cat.value}`}
                checked={selectedCategories.includes(cat.value)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedCategories([...selectedCategories, cat.value]);
                  } else {
                    setSelectedCategories(selectedCategories.filter(c => c !== cat.value));
                  }
                }}
              />
              <Label htmlFor={`cat-${cat.value}`} className="text-sm font-normal">
                {cat.label}
              </Label>
            </div>
          ))}
        </div>

        <Button type="submit" className="w-full">Filtrar</Button>
        {hasFilters && (
          <Button type="button" variant="outline" className="w-full" onClick={clearFilters}>
            Limpiar filtros
          </Button>
        )}
      </form>
    </div>
  );
}
