import Link from "next/link";
import { ShieldOff, ArrowLeft } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Variante semántica para AccessDenied. Un acceso restringido no es un error
 * ni una deuda, así que no lleva coral (The Señal Rule): solo tonos del tapiz
 * y polvo en el cuadro de icono.
 *
 * - billing: acceso financiero (lavado tapiz) — /billing, /invoices, /payouts
 * - admin:   superficie de admin (polvo con noche) — /settings, /super-admin/*
 * - default: cualquier otra superficie (lavado tapiz)
 */
export type AccessDeniedVariant = "billing" | "admin" | "default";

const variantStyles = {
  billing: { bg: "bg-mat-wash", text: "text-mat-deep" },
  admin: { bg: "bg-chalk-dust", text: "text-mat-night" },
  default: { bg: "bg-mat-wash", text: "text-mat-deep" },
} as const;

interface AccessDeniedProps {
  /**
   * Variante visual. Default "default" (lavado tapiz) si no se especifica.
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
        "rounded-xl border border-chalk-line border-t-[3px] border-t-mat-night bg-white p-8 text-mat-night",
        "flex flex-col items-center text-center",
        className,
      )}
    >
      <div
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-md",
          styles.bg,
          styles.text,
        )}
      >
        <ShieldOff className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
      </div>

      <h1 className="mt-4 font-display text-2xl font-black uppercase leading-none text-mat-night">{title}</h1>

      <p className="mt-2 max-w-md text-sm text-ramp-600">{description}</p>

      <Button asChild variant="outline" className="mt-6">
        <Link href={ctaHref}>
          <ArrowLeft className="mr-2 h-4 w-4" strokeWidth={1.8} />
          {ctaLabel}
        </Link>
      </Button>
    </div>
  );
}