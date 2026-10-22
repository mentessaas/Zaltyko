import Link from "next/link";
import { ShieldOff, ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Variante semántica para AccessDenied. Cada variante mapea a tokens del
 * Zaltyko Brand Book (coral/navy) en lugar de los defaults de Tailwind
 * (red/gray) que son Vercel/AI template.
 *
 * - billing: acceso financiero (coral) — /billing, /invoices, /payouts
 * - admin:   superficie de admin (navy) — /settings, /super-admin/*
 * - default: cualquier otro surface — fallback neutral coral
 */
export type AccessDeniedVariant = "billing" | "admin" | "default";

const variantStyles = {
  billing: { bg: "bg-zaltyko-coral/10", text: "text-zaltyko-coral" },
  admin: { bg: "bg-zaltyko-navy/10", text: "text-zaltyko-navy" },
  default: { bg: "bg-zaltyko-coral/10", text: "text-zaltyko-coral" },
} as const;

interface AccessDeniedProps {
  /**
   * Variante visual. Default "default" (coral) si no se especifica.
   */
  variant?: AccessDeniedVariant;

  /**
   * Título principal de la pantalla. Default "Acceso restringido".
   */
  title?: string;

  /**
   * Descripción del motivo. Default genérico que se puede sobreescribir.
   */
  description?: string;

  /**
   * Texto del CTA. Default "Volver".
   */
  ctaLabel?: string;

  /**
   * Href del CTA (a donde llevar al usuario). Requerido.
   */
  ctaHref: string;

  className?: string;
}

/**
 * Pantalla in-page para reemplazando los `redirect()` silenciosos del flujo
 * de auth (Operate P2 #1 del critique .impeccable). Antes, un coach que
 * tocaba `/billing` terminaba en `/coach` sin explicación — se siente como
 * un bug. Ahora ve un mensaje claro con CTA a su home real.
 *
 * Scope mínimo: solo se usa hoy en `/billing`. Otros redirects silenciosos
 * (dashboard/page.tsx, coach/page.tsx, layout.tsx, my-dashboard/page.tsx)
 * siguen como redirect y se migran a este primitive en PRs siguientes si
 * la iteración con Elvis lo justifica.
 */
export function AccessDenied({
  variant = "default",
  title = "Acceso restringido",
  description = "Tu rol actual no tiene permisos para ver esta sección. Si crees que es un error, contacta al administrador de tu academia.",
  ctaLabel = "Volver",
  ctaHref,
  className,
}: AccessDeniedProps) {
  const styles = variantStyles[variant];
  return (
    <div
      className={cn(
        "rounded-[20px] border border-border/80 bg-card p-8 shadow-soft",
        "flex flex-col items-center text-center",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-12 w-12 items-center justify-center rounded-full",
          styles.bg,
          styles.text,
        )}
      >
        <ShieldOff className="h-6 w-6" strokeWidth={1.8} />
      </div>

      <h1 className="mt-4 text-2xl font-bold tracking-tight">{title}</h1>

      <p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>

      <Button
        asChild
        variant="outline"
        className="mt-6 border-zaltyko-teal/30 text-zaltyko-teal hover:bg-zaltyko-teal/5 hover:text-zaltyko-teal"
      >
        <Link href={ctaHref}>
          <ArrowLeft className="mr-2 h-4 w-4" strokeWidth={1.8} />
          {ctaLabel}
        </Link>
      </Button>
    </div>
  );
}