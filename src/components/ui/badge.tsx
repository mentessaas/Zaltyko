import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Chip de cinta «Magnesio sobre tapiz»: rectángulo de 6–8 px, nunca píldora.
 * Tonos del sistema (DESIGN.md, «Tonos de estado»):
 * - default / active / success: lavado tapiz con texto zona de seguridad.
 * - pending: polvo con texto `ramp-600` (en reposo, programado, en curso).
 * - warning: aviso en ocre (tinta ocre oscura sobre lavado ocre claro).
 * - error: lavado señal con `signal-ink`. Solo error, deuda o borrado.
 * - outline: cinta blanca con borde de línea de magnesio.
 */
const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-mat-wash text-mat-deep hover:bg-mat-200 dark:hover:bg-mat-lane/20",
        outline:
          "border-chalk-line bg-white text-mat-night hover:bg-chalk",
        active:
          "border-transparent bg-mat-wash text-mat-deep hover:bg-mat-200 dark:hover:bg-mat-lane/20",
        pending:
          "border-transparent bg-chalk-dust text-ramp-600 hover:bg-ramp-200 dark:hover:bg-ramp-700",
        success:
          "border-transparent bg-mat-wash text-mat-deep hover:bg-mat-200 dark:hover:bg-mat-lane/20",
        warning:
          "border-transparent bg-ochre-wash text-ochre-ink hover:bg-ochre-200 dark:hover:bg-ochre/25",
        error:
          "border-transparent bg-signal-wash text-signal-ink hover:bg-signal-200 dark:hover:bg-signal/25",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
  VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
