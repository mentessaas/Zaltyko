"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const CATEGORIES = [
  { value: "", label: "Todas las categorias" },
  { value: "coach", label: "Entrenador" },
  { value: "assistant", label: "Auxiliar" },
  { value: "admin", label: "Administrativo" },
  { value: "judge", label: "Juez/Arbitro" },
];

const JOB_TYPES = [
  { value: "", label: "Todos los tipos" },
  { value: "full_time", label: "Tiempo completo" },
  { value: "part_time", label: "Tiempo parcial" },
  { value: "contract", label: "Contrato" },
  { value: "freelance", label: "Freelance" },
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
        <label className="text-sm font-medium mb-2 block">Buscar</label>
        <Input
          placeholder="Puesto, academia..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && applyFilters()}
        />
      </div>
      <div>
        <label className="text-sm font-medium mb-2 block">Categoria</label>
        <select
          className="w-full border rounded-md px-3 py-2 text-sm"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm font-medium mb-2 block">Tipo</label>
        <select
          className="w-full border rounded-md px-3 py-2 text-sm"
          value={jobType}
          onChange={(e) => setJobType(e.target.value)}
        >
          {JOB_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>
      <Button onClick={applyFilters} className="w-full">
        Filtrar
      </Button>
    </div>
  );
}
