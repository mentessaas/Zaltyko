import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

import Navbar from "@/app/(site)/Navbar";
import Footer from "@/app/(site)/Footer";
import { DisclosureAccordion } from "@/components/ui/disclosure-accordion";
import { SkipLink } from "@/components/ui/skip-link";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────────────────────
   Piezas comunes de las páginas públicas secundarias (producto, preguntas,
   contacto, ayuda, guías y legales), con el mismo lenguaje que la portada y
   los precios: barra y pie del mundo, banda de tapiz con marco de cinta para
   la cabecera, listas regladas sobre magnesio y cierre de vuelta al tapiz.
   Cada página conserva su metadata y su JSON-LD; el h1 abre la banda sin
   antetítulo encima (The Label Is Data Rule).
   ───────────────────────────────────────────────────────────────────────── */

/** CTA blanco tipo cinta sobre tapiz (el de la portada). */
export const tapeButtonClass =
  "inline-flex min-h-14 items-center justify-center gap-2 rounded-md bg-white px-7 text-base font-extrabold text-mat-deep transition-colors duration-150 ease-out hover:bg-chalk focus-visible:ring-white focus-visible:ring-offset-mat [&_svg]:size-4 [&_svg]:shrink-0";

/** Pareja del CTA de cinta: contorno blanco de 2 px que se aclara al pasar. */
export const tapeOutlineButtonClass =
  "inline-flex min-h-14 items-center justify-center gap-2 rounded-md border-2 border-white/60 px-7 text-base font-bold text-white transition-colors duration-150 ease-out hover:border-white hover:bg-white/10 focus-visible:ring-white focus-visible:ring-offset-mat [&_svg]:size-4 [&_svg]:shrink-0";

/** Contenedor público: 80 rem con márgenes de 24 / 40 / 56 px. */
export const publicContainerClass = "mx-auto max-w-7xl px-6 sm:px-10 lg:px-14";

/**
 * Barra pública, contenido principal y pie, iguales en todas las páginas.
 * `structuredData` (JSON-LD) se pinta tras el pie, donde ya estaba.
 */
export function PublicPageShell({ children, structuredData }: { children: ReactNode; structuredData?: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <SkipLink href="#main-content">Saltar al contenido principal</SkipLink>
      <Navbar />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <Footer />
      {structuredData}
    </div>
  );
}

type PublicPageHeaderProps = {
  /** Id del h1, para `aria-labelledby` de la banda. */
  titleId: string;
  title: ReactNode;
  /**
   * Metadato pequeño bajo el titular (p. ej. la categoría de una guía). Nunca
   * va encima como antetítulo: el h1 abre la banda (The Label Is Data Rule).
   */
  meta?: ReactNode;
  lede?: ReactNode;
  /** Enlace de vuelta, en blanco sobre el tapiz. */
  back?: { href: string; label: string };
  /** `headline` para páginas de producto; `title` para guías y legales. */
  size?: "headline" | "title";
  /** Datos de la página bajo el lede (fecha de actualización, acciones…). */
  children?: ReactNode;
};

/**
 * Cabecera de página pública: banda de tapiz a sangre bajo la barra, con el
 * marco de cinta abierto por abajo (como la portada de precios), titular
 * condensado en mayúsculas y lede en blanco al 85 %.
 */
export function PublicPageHeader({
  titleId,
  title,
  meta,
  lede,
  back,
  size = "headline",
  children,
}: PublicPageHeaderProps) {
  return (
    <section aria-labelledby={titleId} className="mat-field relative overflow-hidden pt-16">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-3 bottom-0 top-[4.75rem] border-x-[3px] border-t-[3px] border-white/80 sm:inset-x-6 sm:top-[5.5rem]"
      />
      <div className="relative mx-auto max-w-7xl px-8 pb-14 pt-12 sm:px-14 lg:pb-16 lg:pt-16">
        {back ? (
          <Link
            href={back.href}
            className="-ml-1 mb-6 inline-flex min-h-11 items-center gap-2 rounded-sm px-1 text-sm font-semibold text-white/85 transition-colors hover:text-white focus-visible:ring-white focus-visible:ring-offset-mat"
          >
            <ArrowLeft aria-hidden className="h-4 w-4" />
            {back.label}
          </Link>
        ) : null}
        <h1
          id={titleId}
          className={cn(
            "font-display max-w-4xl font-black uppercase text-white",
            size === "title"
              ? "text-[clamp(2rem,3.5vw,3rem)] leading-[0.95]"
              : "text-[clamp(2.25rem,5vw,4rem)] leading-[0.92]"
          )}
        >
          {title}
        </h1>
        {meta ? <p className="mt-4 text-sm font-semibold text-white/85">{meta}</p> : null}
        {lede ? <p className="mt-6 max-w-2xl text-lg leading-relaxed text-white/85">{lede}</p> : null}
        {children ? <div className="mt-6">{children}</div> : null}
      </div>
    </section>
  );
}

type PublicPageCloseProps = {
  titleId: string;
  title: ReactNode;
  text?: ReactNode;
  /** Enlaces de acción, con `tapeButtonClass` / `tapeOutlineButtonClass`. */
  actions: ReactNode;
  note?: ReactNode;
};

/** Cierre de página: de vuelta al tapiz con el marco de cinta, como la portada. */
export function PublicPageClose({ titleId, title, text, actions, note }: PublicPageCloseProps) {
  return (
    <section aria-labelledby={titleId} className="mat-field relative overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-3 border-[3px] border-white/80 sm:inset-6" />
      <div className="relative mx-auto grid max-w-7xl gap-8 px-8 py-20 sm:px-14 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-end lg:py-24">
        <div>
          <h2
            id={titleId}
            className="font-display max-w-3xl text-[clamp(2rem,4.5vw,3.5rem)] font-black uppercase leading-[0.95] text-white"
          >
            {title}
          </h2>
          {text ? <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/85">{text}</p> : null}
        </div>
        <div className="flex flex-col gap-3 lg:items-end">
          <div className="flex flex-col gap-3 sm:flex-row">{actions}</div>
          {note ? <p className="text-sm text-white/80">{note}</p> : null}
        </div>
      </div>
    </section>
  );
}

type PublicFaqListProps = {
  idPrefix: string;
  items: readonly { question: string; answer: string }[];
  className?: string;
};

/**
 * Preguntas sobre <details> nativo, como las de la portada: regla de 3 px
 * arriba y filas regladas. Todas abiertas al cargar, para que el texto
 * visible sea el mismo que el de los datos estructurados de la página.
 */
export function PublicFaqList({ idPrefix, items, className }: PublicFaqListProps) {
  const entries = items.map((item, i) => ({
    id: `${idPrefix}-${i}`,
    title: item.question,
    content: <p>{item.answer}</p>,
  }));
  return (
    <DisclosureAccordion
      items={entries}
      exclusive={false}
      defaultOpen={entries.map((entry) => entry.id)}
      className={cn("rounded-none border-x-0 border-b-0 border-t-[3px] border-t-mat-night bg-transparent", className)}
      classNames={{
        item: "bg-transparent open:bg-white/70",
        trigger: "px-0 py-5 text-lg font-bold text-mat-night hover:bg-transparent group-open:text-mat sm:px-2",
        marker: "text-mat",
        content: "px-0 pb-6 text-base leading-relaxed text-ramp-600 sm:px-2",
      }}
    />
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Plantilla de lectura de las páginas legales: columna de unos 68 caracteres
   sobre blanco, texto de trabajo a 1 rem con interlineado 1,75 y apartados
   en lista reglada (regla de 3 px arriba, línea de magnesio entre apartados).
   El texto llega tal cual desde cada página.
   ───────────────────────────────────────────────────────────────────────── */

export function PublicReadingColumn({ children }: { children: ReactNode }) {
  return (
    <div className="bg-white">
      <div className={cn(publicContainerClass, "py-14 lg:py-20")}>
        <div className="max-w-[68ch]">{children}</div>
      </div>
    </div>
  );
}

export function PublicLegalSections({
  sections,
}: {
  sections: readonly { title: string; paragraphs: readonly string[] }[];
}) {
  return (
    <div className="mt-12 border-t-[3px] border-mat-night">
      {sections.map((section) => (
        <article key={section.title} className="border-b border-chalk-line py-8">
          <h2 className="font-display text-xl font-extrabold uppercase leading-tight text-mat-night">{section.title}</h2>
          <div className="mt-4 space-y-4 text-base leading-[1.75] text-ramp-600">
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}
