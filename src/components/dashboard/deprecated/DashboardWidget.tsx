"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface DashboardWidgetProps {
  /** Título del widget */
  title: string;
  /** Subtítulo o descripción */
  subtitle?: string;
  /** Ícono del widget */
  icon?: React.ComponentType<{ className?: string }>;
  /** children a renderizar dentro del widget */
  children: React.ReactNode;
  /** Clase CSS adicional */
  className?: string;
  /** Variante de color del ícono */
  variant?: "default" | "success" | "warning" | "danger" | "info";
  /** Enlace opcional para ver más */
  action?: {
    label: string;
    href: string;
  };
  /** Si el widget está cargando */
  loading?: boolean;
}

const VARIANT_STYLES = {
  default: {
    bg: "bg-primary/10",
    text: "text-primary",
    ring: "ring-primary/20",
  },
  success: {
    bg: "bg-emerald-100",
    text: "text-emerald-600",
    ring: "ring-emerald-500/20",
  },
  warning: {
    bg: "bg-amber-100",
    text: "text-amber-600",
    ring: "ring-amber-500/20",
  },
  danger: {
    bg: "bg-red-100",
    text: "text-red-600",
    ring: "ring-red-500/20",
  },
  info: {
    bg: "bg-blue-100",
    text: "text-blue-600",
    ring: "ring-blue-500/20",
  },
};

export function DashboardWidget({
  title,
  subtitle,
  icon: Icon,
  children,
  className,
  variant = "default",
  action,
  loading,
}: DashboardWidgetProps) {
  const variantStyles = VARIANT_STYLES[variant];

  if (loading) {
    return (
      <div className={cn("rounded-xl border bg-card p-6 shadow-sm", className)}>
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-32 rounded bg-muted" />
          <div className="h-20 rounded bg-muted" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card p-5 shadow-sm transition-all hover:shadow-md",
        className
      )}
    >
      {/* Header */}
      <div className="mb-4 flex items-start justify-between">
        <div className="flex items-center gap-3">
          {Icon && (
            <div
              className={cn(
                "flex h-10 w-10 items-center justify-center rounded-lg",
                variantStyles.bg,
                variantStyles.text
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
          )}
          <div>
            <h3 className="font-semibold text-foreground">{title}</h3>
            {subtitle && (
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            )}
          </div>
        </div>

        {action && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={action.href} className="text-xs text-muted-foreground hover:text-primary">
              {action.label}
              <ArrowRight className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        )}
      </div>

      {/* Content */}
      <div>{children}</div>
    </div>
  );
}
