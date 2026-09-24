"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CATEGORIES = [
  { value: "", label: "Todas las categorías" },
  { value: "coach", label: "Entrenador" },
  { value: "assistant_coach", label: "Asistente de entrenador" },
  { value: "administrative", label: "Administrativo" },
  { value: "physiotherapist", label: "Fisioterapia" },
  { value: "psychologist", label: "Psicología deportiva" },
  { value: "other", label: "Otro" },
];

const JOB_TYPES = [
  { value: "", label: "Todos los tipos" },
  { value: "full_time", label: "Tiempo completo" },
  { value: "part_time", label: "Tiempo parcial" },
  { value: "internship", label: "Prácticas" },
];

export function JobFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [category, setCategory] = useState(searchParams.get("category") || "");
  const [jobType, setJobType] = useState(searchParams.get("jobType") || "");

  function applyFilters() {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (category) params.set("category", category);
    if (jobType) params.set("jobType", jobType);
    router.push(`/empleo?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div>
        <label htmlFor="job-search" className="mb-2 block text-sm font-medium">Buscar</label>
        <Input
          id="job-search"
          placeholder="Puesto, academia..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyFilters()}
        />
      </div>
      <div>
        <label htmlFor="job-category" className="mb-2 block text-sm font-medium">Categoría</label>
        <select
          id="job-category"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="job-type" className="mb-2 block text-sm font-medium">Tipo de jornada</label>
        <select
          id="job-type"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={jobType}
          onChange={(e) => setJobType(e.target.value)}
        >
          {JOB_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <Button type="button" onClick={applyFilters} className="w-full">
        Filtrar
      </Button>
    </div>
  );
}
