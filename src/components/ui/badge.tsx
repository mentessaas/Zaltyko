import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-mat-wash text-mat-deep hover:bg-[#D9E2F8]",
        outline:
          "border-zaltyko-mist bg-white text-zaltyko-text-main hover:bg-zaltyko-white dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:hover:bg-slate-800",
        active:
          "border-transparent bg-mat-wash text-mat-deep hover:bg-[#D9E2F8]",
        pending:
          "border-transparent bg-zaltyko-mist/30 text-slate-600 hover:bg-zaltyko-mist/40",
        success:
          "border-transparent bg-mat-wash text-mat-deep hover:bg-[#D9E2F8]",
        error:
          "border-transparent bg-signal-wash text-signal-ink hover:bg-[#FBDCD3]",
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
