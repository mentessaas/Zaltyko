"use client";

import { Check, Clock, Users, Building2, Calendar, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepPreviewProps {
  step: number;
  data: Record<string, unknown>;
  className?: string;
}

const STEP_ICONS: Record<number, typeof Check> = {
  2: Building2,
  3: Users,
  4: Calendar,
  5: Users,
  6: Users,
  7: CreditCard,
};

const STEP_LABELS: Record<number, string> = {
  2: "Academia",
  3: "Estructura",
  4: "Grupo",
  5: "Atletas",
  6: "Entrenadores",
  7: "Pagos",
};

export function StepPreview({ step, data, className }: StepPreviewProps) {
  const Icon = STEP_ICONS[step] || Check;
  const label = STEP_LABELS[step] || "Paso";

  const getPreviewContent = () => {
    switch (step) {
      case 2:
        return (
          <div className="space-y-2">
            {data.name && (
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm">Nombre: <strong>{String(data.name)}</strong></span>
              </div>
            )}
            {data.academyType && (
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm">Tipo: <strong>{String(data.academyType)}</strong></span>
              </div>
            )}
            {(data.country || data.region || data.city) && (
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm">
                  Ubicación: {[data.city, data.region, data.country].filter(Boolean).join(", ")}
                </span>
              </div>
            )}
          </div>
        );
      case 4:
        return (
          <div className="space-y-2">
            {data.groupName && (
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm">Grupo: <strong>{String(data.groupName)}</strong></span>
              </div>
            )}
            {data.groupLevel && (
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm">Nivel: <strong>{String(data.groupLevel)}</strong></span>
              </div>
            )}
            {data.groupStartTime && data.groupEndTime && (
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm">
                  Horario: <strong>{String(data.groupStartTime)} - {String(data.groupEndTime)}</strong>
                </span>
              </div>
            )}
          </div>
        );
      case 5:
        const athletes = Array.isArray(data.athletes) ? data.athletes.filter((a: any) => a?.name) : [];
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-600" />
              <span className="text-sm">
                <strong>{athletes.length}</strong> atleta{athletes.length !== 1 ? "s" : ""} listo{athletes.length !== 1 ? "s" : ""} para crear
              </span>
            </div>
            {athletes.length > 0 && (
              <ul className="ml-6 list-disc space-y-1 text-xs text-muted-foreground">
                {athletes.slice(0, 3).map((athlete: any, idx: number) => (
                  <li key={idx}>{athlete.name}</li>
                ))}
                {athletes.length > 3 && <li>y {athletes.length - 3} más...</li>}
              </ul>
            )}
          </div>
        );
      case 6:
        const coaches = Array.isArray(data.coaches) ? data.coaches.filter((c: any) => c?.email) : [];
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-purple-600" />
              <span className="text-sm">
                <strong>{coaches.length}</strong> entrenador{coaches.length !== 1 ? "es" : ""} listo{coaches.length !== 1 ? "s" : ""} para invitar
              </span>
            </div>
            {coaches.length > 0 && (
              <ul className="ml-6 list-disc space-y-1 text-xs text-muted-foreground">
                {coaches.slice(0, 3).map((coach: any, idx: number) => (
                  <li key={idx}>{coach.name || coach.email}</li>
                ))}
                {coaches.length > 3 && <li>y {coaches.length - 3} más...</li>}
              </ul>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  const content = getPreviewContent();
  if (!content) return null;

  return (
    <div className={cn("rounded-lg border border-primary/20 bg-primary/5 p-4", className)}>
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">Resumen del {label}</h4>
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">~2 min</span>
          </div>
          {content}
        </div>
      </div>
    </div>
  );
}

