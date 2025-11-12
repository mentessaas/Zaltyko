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
        active:
          "border-transparent bg-zaltyko-accent text-zaltyko-primary-dark hover:bg-zaltyko-accent-light",
        pending:
          "border-transparent bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
        success:
          "border-transparent bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
        error:
          "border-transparent bg-destructive/10 text-destructive hover:bg-destructive/20",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };

