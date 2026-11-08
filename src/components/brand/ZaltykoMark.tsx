import { cn } from "@/lib/utils";

/**
 * Logo Z de Zaltyko (compromiso de marca). Mismos trazados que
 * public/branding/zaltyko/logo-zaltyko-monochrome.svg, pintados con
 * currentColor para que funcionen en blanco sobre tapiz y en noche sobre
 * magnesio sin crear una versión nueva del logo.
 */
export function ZaltykoMark({ className, title = "Zaltyko" }: { className?: string; title?: string | null }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role={title ? "img" : undefined}
      aria-label={title ?? undefined}
      aria-hidden={title ? undefined : true}
      className={cn("h-8 w-8 shrink-0", className)}
    >
      <path d="M19.4 13.8H47.1C50.8 13.8 52.9 18.1 50.6 21L29.7 49.4H16.8L37.8 22.7H14.2L19.4 13.8Z" fill="currentColor" />
      <path
        d="M17.7 43.2C23.1 35.3 31.5 28.1 42.5 21.9H52C45.3 30.1 37.1 37.3 27.1 43.2H17.7Z"
        fill="currentColor"
        opacity="0.82"
      />
      <path d="M16.8 49.4H42.7C46.1 49.4 49.2 47.5 50.7 44.5L53 39.8H28.1L16.8 49.4Z" fill="currentColor" />
    </svg>
  );
}

/** Marca + nombre, rotulado condensado como en el lateral de un tapiz. */
export function ZaltykoLockup({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <ZaltykoMark title={null} className={markClassName} />
      <span className="font-display text-xl font-extrabold uppercase leading-none tracking-[0.04em]">
        Zaltyko
      </span>
    </span>
  );
}
