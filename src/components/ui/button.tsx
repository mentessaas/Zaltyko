import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.99]",
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
      size: {
        default: "h-11 px-6 py-2.5",
        sm: "h-9 min-h-9 rounded-lg px-4 text-xs",
        lg: "h-12 rounded-xl px-8 text-base",
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
