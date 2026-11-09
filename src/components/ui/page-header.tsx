"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  breadcrumbs?: BreadcrumbItem[];
  title: string;
  description?: string;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}

/**
 * Cabecera de pantalla «Magnesio sobre tapiz»: sin tarjeta. Migas en
 * rótulo de pista, título condensado en mayúsculas apoyado en una línea de
 * cinta, y las acciones a la derecha. El icono se conserva en la API pero
 * va al lado, pequeño y en azul tapiz.
 */
export function PageHeader({ breadcrumbs, title, description, actions, icon, className }: PageHeaderProps) {
  return (
    <header className={cn("border-b-[3px] border-mat-night pb-5", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Migas de pan" className="mb-3">
          <ol className="floor-label flex flex-wrap items-center gap-2 text-ramp-500">
            {breadcrumbs.map((item, index) => (
              <li key={`${item.label}-${index}`} className="flex items-center gap-2">
                {index > 0 && <span aria-hidden>/</span>}
                {item.href ? (
                  <Link href={item.href} className="transition-colors hover:text-mat">
                    {item.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-mat">
                    {item.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            {icon && <span className="shrink-0 text-mat [&_svg]:h-6 [&_svg]:w-6">{icon}</span>}
            <h1 className="font-display text-[clamp(2rem,3.5vw,3rem)] font-black uppercase leading-[0.95] text-mat-night dark:text-chalk">
              {title}
            </h1>
          </div>
          {description && <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ramp-600 dark:text-ramp-300">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </header>
  );
}
