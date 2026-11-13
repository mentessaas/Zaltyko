import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Botón «Magnesio sobre tapiz»: una sola forma para toda la plataforma.
 * Esquina de 8 px (`rounded-md`), 44 px de alto por defecto (36 px en `sm`,
 * 48 px en `lg`) y transición de color sin levantar la superficie.
 * - default: relleno tapiz con canto de 1 px; hover a zona de seguridad.
 * - secondary: lavado tapiz con texto zona de seguridad.
 * - outline: cinta blanca con borde `ramp-300`; hover a borde y texto tapiz.
 * - ghost: solo texto noche; hover de lavado tapiz.
 * - destructive (peligro): tinta de señal; hover a `signal-800`. Nunca `signal` puro.
 * - link: texto tapiz subrayado al pasar.
 */
const buttonVariants = cva(
  "inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold tracking-[0.01em] transition-[background-color,color,box-shadow,transform] duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.99]",
  {
    variants: {
      variant: {
        default:
          "border border-transparent bg-mat text-white shadow-[0_1px_0_rgba(11,20,48,0.25)] hover:bg-mat-deep",
        destructive:
          "border border-transparent bg-signal-ink text-white hover:bg-signal-800",
        outline:
          "border border-ramp-300 bg-white text-mat-night hover:border-mat hover:text-mat dark:border-ramp-600 dark:bg-transparent dark:text-chalk dark:hover:border-mat-lane dark:hover:text-mat-lane",
        secondary:
          "border border-transparent bg-mat-wash text-mat-deep hover:bg-mat-200 dark:hover:bg-mat-lane/20",
        ghost: "border border-transparent text-mat-night hover:bg-mat-wash hover:text-mat",
        link: "min-h-0 rounded-none px-0 text-mat underline-offset-4 hover:underline hover:text-mat-deep dark:hover:text-mat-lane",
      },
      size: {
        default: "h-11 px-6 py-2.5",
        sm: "h-9 min-h-9 rounded-md px-3.5 text-xs",
        lg: "h-12 rounded-md px-7 text-base",
        icon: "h-11 w-11 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
  VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
