"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";
import type { AssessmentType } from "@/types";

interface AssessmentTypeSelectorProps {
  value: AssessmentType;
  onChange: (type: AssessmentType) => void;
  disabled?: boolean;
}

const assessmentTypes: { type: AssessmentType; label: string; description: string; icon: string }[] = [
  { type: "technical", label: "Técnica", description: "Habilidades técnicas específicas del deporte", icon: "⚙️" },
  { type: "artistic", label: "Artística", description: "Expresión artística y coreografía", icon: "🎨" },
  { type: "physical", label: "Condición Física", description: "Fuerza, flexibilidad y resistencia", icon: "💪" },
  { type: "behavioral", label: "Comportamental", description: "Actitud, disciplina y comportamiento", icon: "🧠" },
  { type: "overall", label: "General", description: "Evaluación integral del atleta", icon: "📊" },
];

export function AssessmentTypeSelector({ value, onChange, disabled }: AssessmentTypeSelectorProps) {
  const id = useId();

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium">Tipo de Evaluación</label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {assessmentTypes.map((item) => (
          <button
            key={item.type}
            type="button"
            disabled={disabled}
            onClick={() => onChange(item.type)}
            className={cn(
              "flex flex-col items-start rounded-lg border-2 p-3 text-left transition-all",
              "hover:border-primary/50 hover:bg-muted/50",
              "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
              value === item.type
                ? "border-primary bg-primary/5"
                : "border-border bg-background",
              disabled && "cursor-not-allowed opacity-50"
            )}
            aria-pressed={value === item.type}
          >
            <span className="text-lg mb-1">{item.icon}</span>
            <span className="font-medium">{item.label}</span>
            <span className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {item.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
