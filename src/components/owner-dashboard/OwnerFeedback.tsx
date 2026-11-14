import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { ownerUi } from "./owner-ui";

/**
 * Respuestas visibles del panel del club: esqueletos mientras se carga y
 * confirmación al terminar una acción. Sin hooks, valen en servidor y cliente.
 */

/** Marca de comprobación que se dibuja de un trazo (movimiento reducido: directa). */
export function DrawnCheck({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("h-5 w-5 shrink-0", className)}
      fill="none"
    >
      <path
        d="M4 12.5l5 5L20 6.5"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="zk-check-draw"
      />
    </svg>
  );
}

/** Confirmación de una acción terminada: lavado tapiz y una marca que se dibuja. */
export function OwnerSuccessNotice({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      role="status"
      className={cn(ownerUi.noticeInfo, "zk-settle flex items-start gap-2.5 font-semibold", className)}
    >
      <DrawnCheck className="mt-0.5 text-mat" />
      <span>{children}</span>
    </p>
  );
}

/**
 * Esqueleto de una lista reglada. El texto «Cargando…» sigue ahí para los
 * lectores de pantalla; a la vista quedan filas de polvo con la forma de lo
 * que va a llegar.
 */
export function OwnerListSkeleton({
  label,
  rows = 3,
  className,
}: {
  label: string;
  rows?: number;
  className?: string;
}) {
  return (
    <div role="status" aria-live="polite" className={cn("grid gap-2.5", className)}>
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="flex items-center gap-3 rounded-md border border-z-line bg-white p-3.5 sm:p-4"
        >
          <span className="h-10 w-10 shrink-0 rounded-md bg-chalk-dust motion-safe:animate-pulse" />
          <span className="grid min-w-0 flex-1 gap-2">
            <span
              className="h-3 rounded-sm bg-chalk-dust motion-safe:animate-pulse"
              style={{ width: `${62 - index * 9}%` }}
            />
            <span
              className="h-2.5 rounded-sm bg-chalk-dust/70 motion-safe:animate-pulse"
              style={{ width: `${38 - index * 5}%` }}
            />
          </span>
          <span className="hidden h-10 w-40 shrink-0 rounded-md bg-chalk-dust motion-safe:animate-pulse sm:block" />
        </div>
      ))}
    </div>
  );
}
