import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // El `min-h-[44px]` global (guía táctil móvil) se aplicaba también en
  // escritorio y hacía que TODOS los botones se vieran macizos. Ahora el área
  // táctil de 44px solo se garantiza en pantallas sin puntero fino; en
  // escritorio el botón usa su altura natural, más compacta y precisa.
  "inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.99] [@media(pointer:fine)]:min-h-0",
  {
    variants: {
      variant: {
        default:
          "border border-transparent bg-zaltyko-teal text-white shadow-soft hover:bg-primary-dark hover:shadow-medium",
        destructive:
          "border border-transparent bg-zaltyko-coral text-white shadow-soft hover:bg-zaltyko-coral/90",
        outline:
          "border border-zaltyko-indigo bg-transparent text-zaltyko-indigo hover:bg-zaltyko-indigo/5",
        secondary:
          "border border-zaltyko-indigo/15 bg-zaltyko-indigo/10 text-zaltyko-indigo hover:bg-zaltyko-indigo/15",
        ghost: "text-zaltyko-text-main hover:bg-zaltyko-teal/10 hover:text-zaltyko-teal",
        link: "min-h-0 rounded-none px-0 text-zaltyko-teal underline-offset-4 hover:underline hover:text-zaltyko-primary-dark",
      },
      // Alturas más contenidas en escritorio (36/32/44) manteniendo el área
      // táctil en móvil vía el min-h de la clase raíz.
      size: {
        default: "h-11 px-5 [@media(pointer:fine)]:h-9",
        sm: "h-9 min-h-9 rounded-sm px-3 text-xs [@media(pointer:fine)]:h-8",
        lg: "h-12 rounded-lg px-7 text-base [@media(pointer:fine)]:h-11",
        icon: "h-11 w-11 [@media(pointer:fine)]:h-9 [@media(pointer:fine)]:w-9",
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
