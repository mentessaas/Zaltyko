import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[10px] text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zaltyko-primary-light focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]",
  {
    variants: {
      variant: {
        default:
          "bg-zaltyko-primary text-white shadow-soft hover:bg-zaltyko-primary-dark hover:shadow-medium font-medium",
        destructive:
          "bg-zaltyko-danger text-white shadow-soft hover:bg-zaltyko-danger/90 hover:shadow-medium",
        outline:
          "border border-zaltyko-border bg-zaltyko-bg-light text-zaltyko-text-main shadow-soft hover:bg-zaltyko-bg hover:border-zaltyko-primary/30",
        secondary:
          "bg-zaltyko-primary-light text-zaltyko-primary-dark shadow-soft hover:bg-zaltyko-primary/20 hover:shadow-medium",
        ghost: "text-zaltyko-text-main hover:text-zaltyko-primary hover:bg-zaltyko-primary-light/50",
        link: "text-zaltyko-primary underline-offset-4 hover:underline hover:text-zaltyko-primary-dark",
      },
      size: {
        default: "h-10 px-4 py-2.5 min-h-[44px] sm:min-h-[40px]",
        sm: "h-9 rounded-[8px] px-3 text-xs min-h-[40px] sm:min-h-[36px]",
        lg: "h-12 rounded-[12px] px-6 text-base min-h-[48px] sm:min-h-[44px]",
        icon: "h-10 w-10 rounded-[10px] min-h-[44px] min-w-[44px] sm:min-h-[40px] sm:min-w-[40px]",
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
