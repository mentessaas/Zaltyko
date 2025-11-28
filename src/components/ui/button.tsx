import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zaltyko-primary-light focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-zaltyko-primary-dark to-zaltyko-primary text-white shadow-button hover:shadow-medium hover:brightness-110 border-0",
        destructive:
          "bg-zaltyko-accent-coral text-white shadow-soft hover:bg-red-600 hover:shadow-medium",
        outline:
          "border border-zaltyko-border bg-white text-zaltyko-text-main shadow-soft hover:bg-zaltyko-bg hover:border-zaltyko-primary/30",
        secondary:
          "bg-white text-zaltyko-primary-dark border border-zaltyko-primary/10 shadow-soft hover:bg-zaltyko-primary/5 hover:shadow-medium",
        ghost: "text-zaltyko-text-main hover:text-zaltyko-primary hover:bg-zaltyko-primary-light/50",
        link: "text-zaltyko-primary underline-offset-4 hover:underline hover:text-zaltyko-primary-dark",
      },
      size: {
        default: "h-11 px-6 py-2.5 min-h-[44px]",
        sm: "h-9 rounded-lg px-4 text-xs",
        lg: "h-14 rounded-2xl px-8 text-base",
        icon: "h-11 w-11 rounded-xl",
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
