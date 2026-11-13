import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Alerta «Magnesio sobre tapiz»: fondo por tono y borde completo de 1 px,
 * sin pestaña lateral. Tonos (DESIGN.md, «Tonos de estado»):
 * - default: cinta blanca con borde de línea de magnesio.
 * - success: lavado tapiz con texto zona de seguridad.
 * - warning: aviso en ocre (`ochre-wash` / `ochre-ink`), nunca coral.
 * - destructive: error en lavado señal con `signal-ink`.
 */

const alertVariants = cva(
  "relative w-full rounded-card border px-4 py-3 text-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground [&>svg~*]:pl-7",
  {
    variants: {
      variant: {
        default: "border-chalk-line bg-white text-mat-night",
        destructive:
          "border-signal/30 bg-signal-wash text-signal-ink [&>svg]:text-signal-ink dark:[&>svg]:text-signal-light",
        success:
          "border-mat/20 bg-mat-wash text-mat-deep [&>svg]:text-mat dark:[&>svg]:text-mat-lane",
        warning:
          "border-ochre-line bg-ochre-wash text-ochre-ink [&>svg]:text-ochre-ink dark:[&>svg]:text-ochre-light",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-semibold leading-none", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm [&_p]:leading-relaxed", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
