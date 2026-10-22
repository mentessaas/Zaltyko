"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Primitivas de movimiento del dashboard (modo Operate).
 * El movimiento comunica estado y feedback: nada de coreografía de carga.
 * Todas respetan prefers-reduced-motion y son 150-300ms.
 */

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Formatea un número al estilo es-ES. */
function formatNumber(value: number, decimals?: number): string {
  return value.toLocaleString("es-ES", {
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? 0,
  });
}

type CountUpProps = {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Duración en ms. 250ms por defecto: feedback, no espectáculo. */
  duration?: number;
  className?: string;
};

/**
 * Número que anima desde el valor previo al nuevo cuando el dato cambia.
 * Sin JS o con reduced-motion muestra el valor final directamente.
 */
export function CountUp({
  value,
  decimals,
  prefix,
  suffix,
  duration = 250,
  className,
}: CountUpProps) {
  const [display, setDisplay] = useState(value);
  const previousRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = previousRef.current;
    previousRef.current = value;

    if (from === value || reducedMotion()) {
      setDisplay(value);
      return;
    }

    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (value - from) * eased);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return (
    <span className={cn("tabular-nums", className)}>
      {prefix}
      {formatNumber(display, decimals)}
      {suffix}
    </span>
  );
}

type FadeSwapProps = {
  /** Cambia este valor para disparar la transición (p. ej. tab activa). */
  swapKey: string | number;
  children: ReactNode;
  className?: string;
};

/**
 * Transición de fade corta cuando cambia el contenido (tabs, filtros).
 * El contenido siempre está visible: solo anima el intercambio.
 */
export function FadeSwap({ swapKey, children, className }: FadeSwapProps) {
  const [visible, setVisible] = useState(true);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (reducedMotion()) return;
    setVisible(false);
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, [swapKey]);

  return (
    <div
      className={cn(
        "transition-opacity duration-200",
        visible ? "opacity-100" : "opacity-0",
        className
      )}
    >
      {children}
    </div>
  );
}

type StatCardProps = {
  label: string;
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Variación respecto al periodo anterior, ej. "+3%" o "-1". */
  delta?: string;
  deltaTone?: "up" | "down" | "neutral";
  icon?: ReactNode;
  className?: string;
};

/**
 * Tarjeta de métrica estándar del dashboard: label + valor animado + delta.
 * Los colores de estado usan los tokens de marca (teal positivo, coral negativo).
 */
export function StatCard({
  label,
  value,
  decimals,
  prefix,
  suffix,
  delta,
  deltaTone = "neutral",
  icon,
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-card border border-border bg-card p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-medium",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
          {label}
        </p>
        {icon && (
          <span className="text-muted-foreground [&_svg]:h-4.5 [&_svg]:w-4.5">{icon}</span>
        )}
      </div>
      <p className="mt-1.5 font-display text-2xl font-bold text-foreground">
        <CountUp value={value} decimals={decimals} prefix={prefix} suffix={suffix} />
      </p>
      {delta && (
        <p
          className={cn(
            "mt-0.5 text-xs font-semibold",
            deltaTone === "up" && "text-zaltyko-teal",
            deltaTone === "down" && "text-destructive",
            deltaTone === "neutral" && "text-muted-foreground"
          )}
        >
          {delta}
        </p>
      )}
    </div>
  );
}
