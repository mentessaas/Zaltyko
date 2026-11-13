"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { TrendingDown, TrendingUp } from "lucide-react";

import { cn } from "@/lib/utils";

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: ReactNode;
  trend?: {
    value: number;
    label?: string;
  };
  variant?: "default" | "success" | "warning" | "danger" | "info";
  href?: string;
  className?: string;
}

// Celda de marcador «Magnesio sobre tapiz»: panel reglado (cinta blanca,
// borde de línea de magnesio, regla superior de 3 px en noche, 12 px de radio,
// sin sombra). La variante solo tiñe el cuadro de icono con su tono de estado:
// éxito en tapiz, aviso en ocre, peligro en señal, información y reposo en polvo.
const variantStyles = {
  default: { icon: "bg-chalk-dust text-mat-deep" },
  success: { icon: "bg-mat-wash text-mat" },
  warning: { icon: "bg-ochre-wash text-ochre-ink" },
  danger: { icon: "bg-signal-wash text-signal-ink" },
  info: { icon: "bg-chalk-dust text-mat" },
} as const;

export function StatsCard({
  title,
  value,
  subtitle,
  icon,
  trend,
  variant = "default",
  href,
  className,
}: StatsCardProps) {
  const styles = variantStyles[variant];

  const cardContent = (
    <div
      className={cn(
        "rounded-xl border border-chalk-line border-t-[3px] border-t-mat-night bg-white p-6 transition-colors duration-150",
        href && "hover:border-mat",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="floor-label text-ramp-500">{title}</p>
          <p className="tabular font-display text-3xl font-black text-mat-night">{value}</p>
          {subtitle ? <p className="text-xs text-ramp-500">{subtitle}</p> : null}
          {trend ? (
            <div className="flex items-center gap-1 pt-1">
              {trend.value >= 0 ? (
                <TrendingUp className="h-3 w-3 text-mat" aria-hidden="true" />
              ) : (
                <TrendingDown className="h-3 w-3 text-signal-ink" aria-hidden="true" />
              )}
              <span
                className={cn(
                  "tabular text-xs font-semibold",
                  trend.value >= 0 ? "text-mat" : "text-signal-ink"
                )}
              >
                {trend.value > 0 ? "+" : ""}
                {trend.value}%
              </span>
              {trend.label ? <span className="text-xs text-ramp-500">{trend.label}</span> : null}
            </div>
          ) : null}
        </div>

        {icon ? (
          <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-md", styles.icon)}>
            {icon}
          </div>
        ) : null}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {cardContent}
      </Link>
    );
  }

  return cardContent;
}
