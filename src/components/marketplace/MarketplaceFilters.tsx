"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronDown, SlidersHorizontal } from "lucide-react";

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

interface FilterFormProps {
  idPrefix: string;
  search: string;
  selectedTypes: string[];
  selectedCategories: string[];
  hasFilters: boolean;
  onSearchChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onClear: () => void;
  onTypeChange: (type: string, checked: boolean) => void;
  onCategoryChange: (category: string, checked: boolean) => void;
}

function FilterForm({
  idPrefix,
  search,
  selectedTypes,
  selectedCategories,
  hasFilters,
  onSearchChange,
  onSubmit,
  onClear,
  onTypeChange,
  onCategoryChange,
}: FilterFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <Label htmlFor={`${idPrefix}-search`}>Buscar en el marketplace</Label>
        <Input
          id={`${idPrefix}-search`}
          placeholder="Productos o servicios..."
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-xs font-medium uppercase leading-none tracking-[0.05em] text-zaltyko-navy">
          Tipo de publicación
        </legend>
        {TYPES.map((type) => (
          <div key={type.value} className="flex items-center gap-2">
            <Checkbox
              id={`${idPrefix}-type-${type.value}`}
              checked={selectedTypes.includes(type.value)}
              onChange={(event) => onTypeChange(type.value, event.target.checked)}
            />
            <Label htmlFor={`${idPrefix}-type-${type.value}`} className="mb-0 text-sm font-normal">
              {type.label}
            </Label>
          </div>
        ))}
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-xs font-medium uppercase leading-none tracking-[0.05em] text-zaltyko-navy">
          Categoría
        </legend>
        {CATEGORIES.map((category) => (
          <div key={category.value} className="flex items-center gap-2">
            <Checkbox
              id={`${idPrefix}-category-${category.value}`}
              checked={selectedCategories.includes(category.value)}
              onChange={(event) => onCategoryChange(category.value, event.target.checked)}
            />
            <Label htmlFor={`${idPrefix}-category-${category.value}`} className="mb-0 text-sm font-normal">
              {category.label}
            </Label>
          </div>
        ))}
      </fieldset>

      <div className="space-y-2">
        <Button type="submit" className="w-full">
          Aplicar filtros
        </Button>
        {hasFilters && (
          <Button type="button" variant="outline" className="w-full" onClick={onClear}>
            Limpiar filtros
          </Button>
        )}
      </div>
    </form>
  );
}

export function MarketplaceFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [selectedTypes, setSelectedTypes] = useState<string[]>(
    searchParams.getAll("type")
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
  const activeFilterCount = selectedTypes.length + selectedCategories.length + (search.trim() ? 1 : 0);

  const handleTypeChange = (type: string, checked: boolean) => {
    setSelectedTypes((current) =>
      checked ? [...current, type] : current.filter((selected) => selected !== type)
    );
  };

  const handleCategoryChange = (category: string, checked: boolean) => {
    setSelectedCategories((current) =>
      checked ? [...current, category] : current.filter((selected) => selected !== category)
    );
  };

  return (
    <div className="space-y-6">
      <details className="group overflow-hidden rounded-2xl border border-zaltyko-border bg-white shadow-soft lg:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zaltyko-teal focus-visible:ring-inset [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-zaltyko-teal" aria-hidden="true" />
            <span>
              <span className="block text-sm font-semibold text-zaltyko-navy">Filtrar catálogo</span>
              <span className="block text-xs text-muted-foreground">
                {activeFilterCount > 0 ? `${activeFilterCount} filtro${activeFilterCount === 1 ? "" : "s"} activo${activeFilterCount === 1 ? "" : "s"}` : "Busca por tipo o categoría"}
              </span>
            </span>
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="border-t border-zaltyko-border px-4 py-4">
          <FilterForm
            idPrefix="marketplace-mobile"
            search={search}
            selectedTypes={selectedTypes}
            selectedCategories={selectedCategories}
            hasFilters={Boolean(hasFilters)}
            onSearchChange={setSearch}
            onSubmit={handleSearch}
            onClear={clearFilters}
            onTypeChange={handleTypeChange}
            onCategoryChange={handleCategoryChange}
          />
        </div>
      </details>

      <div className="hidden lg:block">
        <FilterForm
          idPrefix="marketplace-desktop"
          search={search}
          selectedTypes={selectedTypes}
          selectedCategories={selectedCategories}
          hasFilters={Boolean(hasFilters)}
          onSearchChange={setSearch}
          onSubmit={handleSearch}
          onClear={clearFilters}
          onTypeChange={handleTypeChange}
          onCategoryChange={handleCategoryChange}
        />
      </div>
    </div>
  );
}
