import { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Variante semántica para StatCard. Son categorías de dato, no estados, así
 * que solo usan tonos del tapiz y polvo (The Señal Rule: el coral queda para
 * errores, deudas y borrados; nunca como acento de una categoría).
 *
 * - attendance: lavado tapiz con icono tapiz — asistencia, engagement
 * - classes:    polvo con icono zona de seguridad — clases, sesiones
 * - assessments:lavado tapiz con icono zona de seguridad — evaluaciones
 * - fees:       polvo con icono tapiz — pagos, cuotas
 * - progress:   polvo con icono noche — progreso general
 */
export type StatCardVariant =
  | "attendance"
  | "classes"
  | "assessments"
  | "fees"
  | "progress";

const variantStyles = {
  attendance: { bg: "bg-mat-wash", text: "text-mat" },
  classes: { bg: "bg-chalk-dust", text: "text-mat-deep" },
  assessments: { bg: "bg-mat-wash", text: "text-mat-deep" },
  fees: { bg: "bg-chalk-dust", text: "text-mat" },
  progress: { bg: "bg-chalk-dust", text: "text-mat-night" },
} as const;

interface StatCardProps {
  variant: StatCardVariant;
  icon: ReactNode;
  label: string;
  value: string | number;
  footnote?: string;
  className?: string;
}

/**
 * Card compacta horizontal para stats de dashboards densos
 * (e.g. MyDashboardPage grid 3-col). Mantiene el layout `icon | label/value`
 * pero reemplaza las clases emerald/blue/purple raw por tokens de marca.
 *
 * Para celdas KPI con flecha de tendencia, usar `StatsCard` (variantes
 * default/success/warning/danger/info). Las dos comparten forma: 12 px de
 * radio, borde de línea de magnesio, sin sombra y cifra tabular condensada.
 */
export function StatCard({
  variant,
  icon,
  label,
  value,
  footnote,
  className,
}: StatCardProps) {
  const styles = variantStyles[variant];
  return (
    <div
      className={cn(
        "rounded-xl border border-chalk-line bg-white p-4 text-mat-night",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
            styles.bg,
            styles.text,
          )}
        >
          {icon}
        </div>
        <div>
          <p className="text-sm text-ramp-600">{label}</p>
          <p className="tabular font-display text-xl font-black">{value}</p>
          {footnote ? (
            <p className="text-xs text-ramp-500">{footnote}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}