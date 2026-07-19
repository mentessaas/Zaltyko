import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-zaltyko-teal/12 text-zaltyko-teal hover:bg-zaltyko-teal/18",
        outline:
          "border-zaltyko-mist bg-white text-zaltyko-text-main hover:bg-zaltyko-white",
        active:
          "border-transparent bg-zaltyko-teal/12 text-zaltyko-teal hover:bg-zaltyko-teal/18",
        pending:
          "border-transparent bg-zaltyko-mist/30 text-slate-600 hover:bg-zaltyko-mist/40",
        success:
          "border-transparent bg-zaltyko-teal/12 text-zaltyko-teal hover:bg-zaltyko-teal/18",
        error:
          "border-transparent bg-zaltyko-coral/12 text-zaltyko-coral hover:bg-zaltyko-coral/18",
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
