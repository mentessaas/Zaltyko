import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-display font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-zaltyko-primary-light focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-zaltyko-primary/10 text-zaltyko-primary hover:bg-zaltyko-primary/20",
        outline:
          "border-zaltyko-border bg-white text-zaltyko-text-main hover:bg-zaltyko-bg",
        active:
          "border-transparent bg-zaltyko-accent-teal/10 text-zaltyko-accent-teal hover:bg-zaltyko-accent-teal/20",
        pending:
          "border-transparent bg-zaltyko-accent-amber/10 text-zaltyko-accent-amber hover:bg-zaltyko-accent-amber/20",
        success:
          "border-transparent bg-zaltyko-accent-teal/10 text-zaltyko-accent-teal hover:bg-zaltyko-accent-teal/20",
        error:
          "border-transparent bg-zaltyko-accent-coral/10 text-zaltyko-accent-coral hover:bg-zaltyko-accent-coral/20",
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

